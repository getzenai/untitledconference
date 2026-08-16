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

export class ChatModelNotConfiguredError extends Error {
	constructor() {
		super(
			'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.'
		);
		this.name = 'ChatModelNotConfiguredError';
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

/**
 * A model that calls one read tool on the first step and then names that tool
 * in the follow-up text. Used when `AI_CHAT_MODEL` is `mock`, so a local
 * session can see streaming and a tool name without a Gateway key.
 *
 * The default is the reviewer queue; the agenda surface passes `get_agenda`
 * with its own arguments, since a tool that takes a conference slug cannot be
 * called with `{}`. A rename sentence (see `RENAME_CONFERENCE`) is the write
 * the assistant-panel Cypress spec needs: approval, then the real tool.
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
			if (promptAlreadyHasTool(prompt)) {
				return { stream: simulateReadableStream({ chunks: textStep as never }) };
			}
			const rename = parseConferenceRename(prompt);
			const chunks = rename
				? mockToolChunks('call_update', 'update_conference', rename)
				: step++ === 0
					? toolStep
					: textStep;
			return { stream: simulateReadableStream({ chunks: chunks as never }) };
		}
	});
}

function mockToolChunks(id: string, name: string, input: Record<string, unknown>) {
	const args = JSON.stringify(input);
	return [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'tool-input-start' as const, id, toolName: name },
		{ type: 'tool-input-delta' as const, id, delta: args },
		{ type: 'tool-input-end' as const, id },
		{ type: 'tool-call' as const, toolCallId: id, toolName: name, input: args },
		{ type: 'finish' as const, finishReason: 'tool-calls' as const, usage: emptyUsage }
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
 * Tests pass a new instance per request: the first HTTP turn emits the
 * tool call (approval stops it), the second is told `afterApproval`.
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
		doStream: async () => ({
			stream: simulateReadableStream({ chunks: (afterApproval ? textStep : toolStep) as never })
		})
	});
}

/**
 * @param mockCall Which read tool the `mock` model should call. A surface only
 * gets the tools it was handed, so the reviewer default would be an unknown
 * tool on the agenda board — the caller names one of its own.
 */
export function createChatModel(mockCall?: {
	toolName: string;
	input: Record<string, unknown>;
}): LanguageModel {
	const { AI_CHAT_MODEL, AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL } = serverEnv();
	// Process export first: wrangler.jsonc pins a production model id, and
	// `AI_CHAT_MODEL=mock` from `scripts/run-e2e.sh` has to win for the
	// flag-on Cypress path.
	const modelId = process.env.AI_CHAT_MODEL || AI_CHAT_MODEL;
	if (modelId === 'mock') {
		return mockCall
			? createMockChatModel(mockCall.toolName, mockCall.input)
			: createMockChatModel();
	}
	if (!AI_GATEWAY_API_KEY || !AI_GATEWAY_BASE_URL) {
		throw new ChatModelNotConfiguredError();
	}
	const openai = createOpenAI({
		apiKey: AI_GATEWAY_API_KEY,
		baseURL: AI_GATEWAY_BASE_URL
	});
	return openai.chat(modelId);
}
