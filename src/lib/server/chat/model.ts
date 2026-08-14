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
 * A model that always calls `list_my_review_assignments` on the first step
 * and then names that tool in the follow-up text. Used when `AI_CHAT_MODEL`
 * is `mock`, so a local session can see streaming and a tool name without a
 * Gateway key.
 */
export function createMockChatModel(): LanguageModel {
	const toolStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{
			type: 'tool-input-start' as const,
			id: 'call_list',
			toolName: 'list_my_review_assignments'
		},
		{ type: 'tool-input-delta' as const, id: 'call_list', delta: '{}' },
		{ type: 'tool-input-end' as const, id: 'call_list' },
		{
			type: 'tool-call' as const,
			toolCallId: 'call_list',
			toolName: 'list_my_review_assignments',
			input: '{}'
		},
		{ type: 'finish' as const, finishReason: 'tool-calls' as const, usage: emptyUsage }
	];
	const textStep = [
		{ type: 'stream-start' as const, warnings: [] },
		{ type: 'text-start' as const, id: 'text_1' },
		{
			type: 'text-delta' as const,
			id: 'text_1',
			delta: 'I used list_my_review_assignments to look at your queue.'
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

export function createChatModel(): LanguageModel {
	const { AI_CHAT_MODEL, AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL } = serverEnv();
	if (AI_CHAT_MODEL === 'mock') return createMockChatModel();
	if (!AI_GATEWAY_API_KEY || !AI_GATEWAY_BASE_URL) {
		throw new ChatModelNotConfiguredError();
	}
	const openai = createOpenAI({
		apiKey: AI_GATEWAY_API_KEY,
		baseURL: AI_GATEWAY_BASE_URL
	});
	return openai.chat(AI_CHAT_MODEL);
}
