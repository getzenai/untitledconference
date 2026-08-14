import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$lib/server/env', () => ({
	serverEnv: () => ({
		AI_CHAT_MODEL: mockEnv.AI_CHAT_MODEL ?? 'openai/gpt-4o-mini',
		AI_GATEWAY_API_KEY: mockEnv.AI_GATEWAY_API_KEY,
		AI_GATEWAY_BASE_URL: mockEnv.AI_GATEWAY_BASE_URL
	})
}));

import { ChatModelNotConfiguredError, createChatModel } from './model';

describe('createChatModel', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.AI_CHAT_MODEL;
	});

	it('returns the local stub when AI_CHAT_MODEL is mock', () => {
		mockEnv.AI_CHAT_MODEL = 'mock';
		expect(createChatModel()).toEqual(expect.objectContaining({ specificationVersion: 'v3' }));
	});

	it('lets AI_CHAT_MODEL=mock on the process win over the binding', () => {
		const previous = process.env.AI_CHAT_MODEL;
		process.env.AI_CHAT_MODEL = 'mock';
		try {
			expect(createChatModel()).toEqual(expect.objectContaining({ specificationVersion: 'v3' }));
		} finally {
			if (previous === undefined) delete process.env.AI_CHAT_MODEL;
			else process.env.AI_CHAT_MODEL = previous;
		}
	});

	it('refuses to start when the Gateway key is missing', () => {
		expect(() => createChatModel()).toThrow(ChatModelNotConfiguredError);
	});
});
