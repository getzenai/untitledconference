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
 * A model that calls one read tool on the first step and then names that tool
 * in the follow-up text. Used when `AI_CHAT_MODEL` is `mock`, so a local
 * session can see streaming and a tool name without a Gateway key.
 *
 * The default is the reviewer queue; the agenda surface passes `get_agenda`
 * with its own arguments, since a tool that takes a conference slug cannot be
 * called with `{}`.
 */
export function createMockChatModel(
	toolName = 'list_my_review_assignments',
	input: Record<string, unknown> = {}
): LanguageModel {
	const args = JSON.stringify(input);
	const toolStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{
			type: 'tool-input-start' as const,
			id: 'call_list',
			toolName
		},
		{ type: 'tool-input-delta' as const, id: 'call_list', delta: args },
		{ type: 'tool-input-end' as const, id: 'call_list' },
		{
			type: 'tool-call' as const,
			toolCallId: 'call_list',
			toolName,
			input: args
		},
		{ type: 'finish' as const, finishReason: 'tool-calls' as const, usage: emptyUsage }
	];
	const textStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'text-start' as const, id: 'text_1' },
		{
			type: 'text-delta' as const,
			id: 'text_1',
			delta: `I used ${toolName} to look.`
		},
		{ type: 'text-end' as const, id: 'text_1' },
		{ type: 'finish' as const, finishReason: 'stop' as const, usage: emptyUsage }
	];
	let step = 0;
	return new MockLanguageModelV3({
		doStream: async () => {
			const chunks = step++ === 0 ? toolStep : textStep;
			return { stream: simulateReadableStream({ chunks: chunks as never }) };
		}
	});
}

/**
 * A model that calls `submit_review` once, then names the write.
 * Tests pass a new instance per request: the first HTTP turn emits the
 * tool call (approval stops it), the second is told `afterApproval`.
 */
export function createMockSubmitReviewModel(
	input: {
		conferenceSlug: string;
		submissionId: number;
		answers: Record<string, string>;
		comment?: string;
	},
	afterApproval = false
): LanguageModel {
	const payload = JSON.stringify({
		conferenceSlug: input.conferenceSlug,
		submissionId: input.submissionId,
		answers: input.answers,
		comment: input.comment ?? ''
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

export function createChatModel(): LanguageModel {
	const { AI_CHAT_MODEL, AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL } = serverEnv();
	// Process export first: wrangler.jsonc pins a production model id, and
	// `AI_CHAT_MODEL=mock` from `scripts/run-e2e.sh` has to win for the
	// flag-on Cypress path.
	const modelId = process.env.AI_CHAT_MODEL || AI_CHAT_MODEL;
	if (modelId === 'mock') return createMockChatModel();
	if (!AI_GATEWAY_API_KEY || !AI_GATEWAY_BASE_URL) {
		throw new ChatModelNotConfiguredError();
	}
	const openai = createOpenAI({
		apiKey: AI_GATEWAY_API_KEY,
		baseURL: AI_GATEWAY_BASE_URL
	});
	return openai.chat(modelId);
}
