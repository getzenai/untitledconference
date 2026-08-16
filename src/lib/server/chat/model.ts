/**
 * The language model the reviewer chat talks to.
 *
 * Production goes through Cloudflare AI Gateway (OpenAI-compatible URL + a
 * Worker secret). Tests and local `AI_CHAT_MODEL=mock` inject a stub so the
 * endpoint is exercisable without a key.
 *
 * Read inside a function — `vite build` has no secrets (CLAUDE.md).
 */
import { serverEnv } from '$lib/server/env';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { chooseChatBackend } from './choose-backend';
import { createGuardedChatBackendFetch } from './org-ai-fetch';
import { loadOrganizationChatBackend } from './org-ai-settings';

export class ChatModelNotConfiguredError extends Error {
	constructor() {
		super(
			'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.'
		);
		this.name = 'ChatModelNotConfiguredError';
	}
}

export class ChatBackendMisconfiguredError extends Error {
	constructor() {
		super('The organization chat backend is misconfigured.');
		this.name = 'ChatBackendMisconfiguredError';
	}
}

const emptyUsage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 0, text: 0, reasoning: undefined }
};

/**
 * Cypress (and any other caller of the `mock` model) can ask for a write
 * without standing up a provider: "Rename the conference <slug> to <name>".
 * Anything else keeps the historical read-tool behaviour.
 */
const RENAME_CONFERENCE = /^Rename the conference (\S+) to (.+)$/;

/**
 * An answer taller than the panel: "Tell me something long". The panel follows
 * the message being written rather than the bottom of the list (#718), and the
 * difference between those two is only visible on an answer that outgrows the
 * viewport.
 */
const LONG_ANSWER = /^Tell me something long$/;

/**
 * Three consecutive read tools in one step (#720). The panel folds finished
 * calls behind "Used 3 tools"; this sentence is how Cypress asks for that
 * shape without a real provider.
 */
const TOOL_TRACE = /^Look up rooms, tracks and formats$/;

type PromptMessage = {
	role?: string;
	content?: string | Array<{ type?: string; text?: string }>;
};

/** The last user line in a language-model prompt, or empty. */
export function lastUserText(prompt: unknown): string {
	if (!Array.isArray(prompt)) return '';
	for (let i = prompt.length - 1; i >= 0; i--) {
		const message = prompt[i] as PromptMessage;
		if (message?.role !== 'user') continue;
		if (typeof message.content === 'string') return message.content;
		if (!Array.isArray(message.content)) return '';
		return message.content
			.filter((part) => part.type === 'text')
			.map((part) => part.text ?? '')
			.join('');
	}
	return '';
}

/**
 * True once the conversation already carries a tool call or its result.
 * A fresh mock instance is created per HTTP turn, so the follow-up after
 * approval cannot use the in-object step counter — it has to read the prompt.
 */
export function promptAlreadyHasTool(prompt: unknown): boolean {
	if (!Array.isArray(prompt)) return false;
	return prompt.some((entry) => {
		const message = entry as PromptMessage & { content?: Array<{ type?: string }> };
		if (message.role === 'tool') return true;
		if (!Array.isArray(message.content)) return false;
		return message.content.some(
			(part) =>
				part.type === 'tool-call' ||
				part.type === 'tool-result' ||
				part.type === 'tool-approval-response'
		);
	});
}

export function parseConferenceRename(
	prompt: unknown
): { conferenceSlug: string; name: string } | undefined {
	const match = lastUserText(prompt).trim().match(RENAME_CONFERENCE);
	if (!match) return undefined;
	const name = match[2].trim();
	return name ? { conferenceSlug: match[1], name } : undefined;
}

export function wantsLongAnswer(prompt: unknown): boolean {
	return LONG_ANSWER.test(lastUserText(prompt).trim());
}

export function wantsToolTrace(prompt: unknown): boolean {
	return TOOL_TRACE.test(lastUserText(prompt).trim());
}

/** `/manage/<slug>/agenda` in the location sentence (`…/agenda, the page titled`). */
const AGENDA_PATH = /\/manage\/([^/?#\s]+)\/agenda\b/;

function promptCorpus(prompt: unknown): string {
	if (!Array.isArray(prompt)) return '';
	const parts: string[] = [];
	for (const entry of prompt) {
		const message = entry as PromptMessage;
		if (typeof message?.content === 'string') {
			parts.push(message.content);
			continue;
		}
		if (!Array.isArray(message?.content)) continue;
		for (const part of message.content) {
			if (typeof part?.text === 'string') parts.push(part.text);
		}
	}
	return parts.join('\n');
}

/**
 * The slug of the agenda board the system prompt says the user is on.
 * The global `/chat` mock has no per-surface `mockCall` (#688); without this
 * it would always fire the reviewer default, and `agenda-chat.cy.ts` would
 * never see a `get_agenda` tool part.
 */
export function parseAgendaSlug(prompt: unknown): string | undefined {
	return promptCorpus(prompt).match(AGENDA_PATH)?.[1];
}

/**
 * A model that calls one read tool on the first step and then names that tool
 * in the follow-up text. Used when `AI_CHAT_MODEL` is `mock`, so a local
 * session can see streaming and a tool name without a Gateway key.
 *
 * The default is the reviewer queue. If the system prompt places the user on
 * the agenda board, the mock calls `get_agenda` with that slug instead — the
 * global `/chat` path never passes `mockCall`. A rename sentence (see
 * `RENAME_CONFERENCE`) is the reversible write the assistant-panel Cypress
 * spec needs: the real tool, no card.
 */
export function createMockChatModel(
	toolName = 'list_my_review_assignments',
	input: Record<string, unknown> = {}
): LanguageModel {
	const toolStep = mockToolChunks('call_list', toolName, input);
	const textStep = mockTextChunks(`I used ${toolName} to look.`);
	let step = 0;
	return new MockLanguageModelV3({
		doStream: async ({ prompt }) => {
			if (wantsLongAnswer(prompt)) {
				return { stream: simulateReadableStream({ chunks: mockLongTextChunks() as never }) };
			}
			if (promptAlreadyHasTool(prompt)) {
				return { stream: simulateReadableStream({ chunks: textStep as never }) };
			}
			if (wantsToolTrace(prompt)) {
				return {
					stream: simulateReadableStream({
						chunks: mockToolTraceChunks(manageSlugFromPrompt(prompt)) as never
					})
				};
			}
			const rename = parseConferenceRename(prompt);
			const agendaSlug = parseAgendaSlug(prompt);
			const chunks = rename
				? mockToolChunks('call_update', 'update_conference', rename)
				: agendaSlug
					? mockToolChunks('call_list', 'get_agenda', { conferenceSlug: agendaSlug })
					: step++ === 0
						? toolStep
						: textStep;
			return { stream: simulateReadableStream({ chunks: chunks as never }) };
		}
	});
}

function mockToolChunks(id: string, name: string, input: Record<string, unknown>) {
	return mockManyToolChunks([{ id, name, input }]);
}

function manageSlugFromPrompt(prompt: unknown): string {
	return promptCorpus(prompt).match(/\/manage\/([^/?#\s]+)\//)?.[1] ?? 'unknown';
}

function mockToolTraceChunks(conferenceSlug: string) {
	return mockManyToolChunks([
		{ id: 'call_rooms', name: 'list_rooms', input: { conferenceSlug } },
		{ id: 'call_tracks', name: 'list_tracks', input: { conferenceSlug } },
		{ id: 'call_formats', name: 'list_session_formats', input: { conferenceSlug } }
	]);
}

function mockManyToolChunks(
	calls: Array<{ id: string; name: string; input: Record<string, unknown> }>
) {
	const chunks: Array<Record<string, unknown>> = [{ type: 'stream-start' as const, warnings: [] }];
	for (const call of calls) {
		const args = JSON.stringify(call.input);
		chunks.push(
			{ type: 'tool-input-start' as const, id: call.id, toolName: call.name },
			{ type: 'tool-input-delta' as const, id: call.id, delta: args },
			{ type: 'tool-input-end' as const, id: call.id },
			{ type: 'tool-call' as const, toolCallId: call.id, toolName: call.name, input: args }
		);
	}
	chunks.push({ type: 'finish' as const, finishReason: 'tool-calls' as const, usage: emptyUsage });
	return chunks;
}

/**
 * One long answer, delivered a paragraph at a time. Each paragraph is numbered
 * so a test can point at a specific line and say where the panel was looking.
 */
function mockLongTextChunks(paragraphs = 24) {
	return [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'text-start' as const, id: 'text_1' },
		...Array.from({ length: paragraphs }, (_, index) => ({
			type: 'text-delta' as const,
			id: 'text_1',
			delta: `Paragraph ${index + 1} of a long answer that outgrows the panel.\n\n`
		})),
		{ type: 'text-end' as const, id: 'text_1' },
		{ type: 'finish' as const, finishReason: 'stop' as const, usage: emptyUsage }
	];
}

function mockTextChunks(delta: string) {
	return [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'text-start' as const, id: 'text_1' },
		{ type: 'text-delta' as const, id: 'text_1', delta },
		{ type: 'text-end' as const, id: 'text_1' },
		{ type: 'finish' as const, finishReason: 'stop' as const, usage: emptyUsage }
	];
}

/**
 * A model that calls `submit_review` once, then names the write.
 * A fresh instance per request: the first step emits the tool call, the
 * follow-up (after the tool result, or when `afterApproval` is set) is text.
 */
type MockSubmitReviewInput = {
	conferenceSlug: string;
	submissionId: number;
	answers: Record<string, string>;
	comment?: string;
	roundId?: number;
};

export function createMockSubmitReviewModel(
	input: MockSubmitReviewInput,
	afterApproval = false
): LanguageModel {
	const payload = JSON.stringify({
		conferenceSlug: input.conferenceSlug,
		submissionId: input.submissionId,
		answers: input.answers,
		comment: input.comment ?? '',
		...(input.roundId === undefined ? {} : { roundId: input.roundId })
	});
	const toolStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{
			type: 'tool-input-start' as const,
			id: 'call_submit',
			toolName: 'submit_review'
		},
		{ type: 'tool-input-delta' as const, id: 'call_submit', delta: payload },
		{ type: 'tool-input-end' as const, id: 'call_submit' },
		{
			type: 'tool-call' as const,
			toolCallId: 'call_submit',
			toolName: 'submit_review',
			input: payload
		},
		{ type: 'finish' as const, finishReason: 'tool-calls' as const, usage: emptyUsage }
	];
	const textStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'text-start' as const, id: 'text_1' },
		{
			type: 'text-delta' as const,
			id: 'text_1',
			delta: `Saved review of submission ${input.submissionId}: ${Object.values(input.answers)[0]}`
		},
		{ type: 'text-end' as const, id: 'text_1' },
		{ type: 'finish' as const, finishReason: 'stop' as const, usage: emptyUsage }
	];
	return new MockLanguageModelV3({
		doStream: async ({ prompt }) => ({
			stream: simulateReadableStream({
				chunks: (afterApproval || promptAlreadyHasTool(prompt) ? textStep : toolStep) as never
			})
		})
	});
}

/**
 * @param organizationId Active organization (`locals.organizationId`). A
 * configured org backend wins over the hosted pair; a broken row does not
 * fall through. `AI_CHAT_MODEL=mock` still wins so Cypress needs no org row.
 * @param mockCall Override the read tool the `mock` model calls when the
 * prompt does not name an agenda board or a rename. The default mock reads
 * those from the prompt itself so `/chat` does not have to pass them in.
 */
export async function createChatModel(
	organizationId?: string | null,
	mockCall?: {
		toolName: string;
		input: Record<string, unknown>;
	}
): Promise<LanguageModel> {
	const { AI_CHAT_MODEL, AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL } = serverEnv();
	// Process export first: wrangler.jsonc pins a production model id, and
	// `AI_CHAT_MODEL=mock` from `scripts/run-e2e.sh` has to win for the
	// flag-on Cypress path.
	const modelId = process.env.AI_CHAT_MODEL || AI_CHAT_MODEL;
	const org =
		modelId === 'mock' || !organizationId
			? undefined
			: await loadOrganizationChatBackend(organizationId);
	const choice = chooseChatBackend({
		modelId,
		platformKey: AI_GATEWAY_API_KEY,
		platformUrl: AI_GATEWAY_BASE_URL,
		org
	});
	if (choice.source === 'mock') {
		return mockCall
			? createMockChatModel(mockCall.toolName, mockCall.input)
			: createMockChatModel();
	}
	if (choice.source === 'broken-organization') {
		throw new ChatBackendMisconfiguredError();
	}
	if (choice.source === 'missing-platform') {
		throw new ChatModelNotConfiguredError();
	}
	const openai = createOpenAI({
		apiKey: choice.apiKey,
		baseURL: choice.baseUrl,
		// Only an org-supplied backend gets the guard: it re-checks the resolved
		// address on every request and every redirect hop (#725). The hosted
		// Gateway is our own URL and needs no lookup.
		...(choice.source === 'organization' ? { fetch: createGuardedChatBackendFetch() } : {})
	});
	return openai.chat(choice.modelId);
}
