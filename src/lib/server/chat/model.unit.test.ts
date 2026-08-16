import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$lib/server/env', () => ({
	serverEnv: () => ({
		AI_CHAT_MODEL: mockEnv.AI_CHAT_MODEL ?? 'openai/gpt-4o-mini',
		AI_GATEWAY_API_KEY: mockEnv.AI_GATEWAY_API_KEY,
		AI_GATEWAY_BASE_URL: mockEnv.AI_GATEWAY_BASE_URL
	})
}));

import {
	ChatModelNotConfiguredError,
	createChatModel,
	lastUserText,
	parseConferenceRename,
	promptAlreadyHasTool
} from './model';

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

describe('mock chat prompt helpers', () => {
	it('reads the last user text part', () => {
		expect(
			lastUserText([
				{ role: 'system', content: 'You are the assistant.' },
				{ role: 'user', content: [{ type: 'text', text: 'First' }] },
				{ role: 'user', content: [{ type: 'text', text: 'Rename the conference acme to Beta' }] }
			])
		).toBe('Rename the conference acme to Beta');
	});

	it('parses a rename sentence and ignores anything else', () => {
		expect(
			parseConferenceRename([
				{
					role: 'user',
					content: [{ type: 'text', text: 'Rename the conference acme-2028 to Beta Summit' }]
				}
			])
		).toEqual({ conferenceSlug: 'acme-2028', name: 'Beta Summit' });
		expect(
			parseConferenceRename([
				{ role: 'user', content: [{ type: 'text', text: 'What is on the board?' }] }
			])
		).toBeUndefined();
	});

	it('sees a prior tool call so a new mock instance can emit the follow-up text', () => {
		expect(
			promptAlreadyHasTool([
				{ role: 'user', content: [{ type: 'text', text: 'Rename the conference acme to Beta' }] }
			])
		).toBe(false);
		expect(
			promptAlreadyHasTool([
				{ role: 'user', content: [{ type: 'text', text: 'Rename the conference acme to Beta' }] },
				{
					role: 'assistant',
					content: [{ type: 'tool-call', toolCallId: 'call_update', toolName: 'update_conference' }]
				}
			])
		).toBe(true);
		expect(
			promptAlreadyHasTool([
				{
					role: 'tool',
					content: [{ type: 'tool-approval-response', approvalId: 'appr_1', approved: true }]
				}
			])
		).toBe(true);
	});
});
