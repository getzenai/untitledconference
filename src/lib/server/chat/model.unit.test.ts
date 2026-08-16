import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const loadOrganizationChatBackend = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/env', () => ({
	serverEnv: () => ({
		AI_CHAT_MODEL: mockEnv.AI_CHAT_MODEL ?? 'openai/gpt-4o-mini',
		AI_GATEWAY_API_KEY: mockEnv.AI_GATEWAY_API_KEY,
		AI_GATEWAY_BASE_URL: mockEnv.AI_GATEWAY_BASE_URL
	})
}));

vi.mock('./org-ai-settings', () => ({
	loadOrganizationChatBackend: (...args: unknown[]) => loadOrganizationChatBackend(...args)
}));

import { MockLanguageModelV3 } from 'ai/test';
import { assistantSystemPrompt } from './assistant';
import {
	ChatBackendMisconfiguredError,
	ChatModelNotConfiguredError,
	createChatModel,
	createMockChatModel,
	lastUserText,
	parseAgendaSlug,
	parseConferenceRename,
	promptAlreadyHasTool,
	wantsLongAnswer
} from './model';

describe('createChatModel', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.AI_CHAT_MODEL;
		loadOrganizationChatBackend.mockReset();
		loadOrganizationChatBackend.mockResolvedValue({ status: 'none' });
	});

	it('returns the local stub when AI_CHAT_MODEL is mock', async () => {
		mockEnv.AI_CHAT_MODEL = 'mock';
		await expect(createChatModel()).resolves.toEqual(
			expect.objectContaining({ specificationVersion: 'v3' })
		);
	});

	it('lets AI_CHAT_MODEL=mock on the process win over the binding', async () => {
		const previous = process.env.AI_CHAT_MODEL;
		process.env.AI_CHAT_MODEL = 'mock';
		try {
			await expect(createChatModel()).resolves.toEqual(
				expect.objectContaining({ specificationVersion: 'v3' })
			);
		} finally {
			if (previous === undefined) delete process.env.AI_CHAT_MODEL;
			else process.env.AI_CHAT_MODEL = previous;
		}
	});

	it('refuses to start when the Gateway key is missing', async () => {
		await expect(createChatModel()).rejects.toBeInstanceOf(ChatModelNotConfiguredError);
	});

	it('uses the organization backend when a row unwraps', async () => {
		loadOrganizationChatBackend.mockResolvedValue({
			status: 'ok',
			baseUrl: 'https://api.openai.com/v1',
			apiKey: 'sk-org',
			modelId: 'org-model'
		});
		await expect(createChatModel('org-1')).resolves.toEqual(
			expect.objectContaining({ modelId: 'org-model' })
		);
	});

	it('falls back to the hosted pair when the org has no row', async () => {
		mockEnv.AI_GATEWAY_API_KEY = 'platform-key';
		mockEnv.AI_GATEWAY_BASE_URL = 'https://gateway.example.test/compat';
		await expect(createChatModel('org-1')).resolves.toEqual(
			expect.objectContaining({ modelId: 'openai/gpt-4o-mini' })
		);
	});

	it('fails closed when the organization row will not unwrap', async () => {
		mockEnv.AI_GATEWAY_API_KEY = 'platform-key';
		mockEnv.AI_GATEWAY_BASE_URL = 'https://gateway.example.test/compat';
		loadOrganizationChatBackend.mockResolvedValue({ status: 'broken' });
		await expect(createChatModel('org-1')).rejects.toBeInstanceOf(ChatBackendMisconfiguredError);
		await expect(createChatModel('org-1')).rejects.not.toBeInstanceOf(ChatModelNotConfiguredError);
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

	it('recognises the long-answer sentence and nothing near it', () => {
		expect(
			wantsLongAnswer([
				{ role: 'user', content: [{ type: 'text', text: '  Tell me something long  ' }] }
			])
		).toBe(true);
		expect(
			wantsLongAnswer([
				{ role: 'user', content: [{ type: 'text', text: 'Tell me something long about rooms' }] }
			])
		).toBe(false);
	});

	it('reads the agenda slug from the system location line', () => {
		expect(
			parseAgendaSlug([
				{
					role: 'system',
					content: assistantSystemPrompt({
						routeId: '/(protected)/manage/[slug]/agenda',
						url: '/manage/acme-2028/agenda',
						title: 'Agenda',
						params: { slug: 'acme-2028' }
					})
				},
				{ role: 'user', content: [{ type: 'text', text: 'What is on the board?' }] }
			])
		).toBe('acme-2028');
		expect(
			parseAgendaSlug([
				{
					role: 'system',
					content:
						'The user is on /manage/acme-2028/agenda?day=2028-05-10, the page titled "Agenda".'
				},
				{ role: 'user', content: [{ type: 'text', text: 'What is on the board?' }] }
			])
		).toBe('acme-2028');
		expect(
			parseAgendaSlug([
				{
					role: 'system',
					content: 'The user is on /review/acme-2028/12, the page titled "Scorecard".'
				},
				{ role: 'user', content: [{ type: 'text', text: 'What is on the board?' }] }
			])
		).toBeUndefined();
	});

	async function firstToolCall(prompt: unknown) {
		const model = createMockChatModel() as MockLanguageModelV3;
		const result = await model.doStream({ prompt } as never);
		const chunks: Array<{ type?: string; toolName?: string; input?: string }> = [];
		const reader = result.stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value as { type?: string; toolName?: string; input?: string });
		}
		const call = chunks.find((chunk) => chunk.type === 'tool-call');
		return { toolName: call?.toolName, input: call?.input };
	}

	it('calls get_agenda when the system prompt is the agenda board', async () => {
		expect(
			await firstToolCall([
				{
					role: 'system',
					content: assistantSystemPrompt({
						routeId: '/(protected)/manage/[slug]/agenda',
						url: '/manage/acme-2028/agenda',
						title: 'Agenda',
						params: { slug: 'acme-2028' }
					})
				},
				{ role: 'user', content: [{ type: 'text', text: 'What is on the board?' }] }
			])
		).toEqual({
			toolName: 'get_agenda',
			input: JSON.stringify({ conferenceSlug: 'acme-2028' })
		});
	});

	it('keeps the reviewer default when the page is not the agenda', async () => {
		expect(
			await firstToolCall([
				{
					role: 'system',
					content: 'The user is on /review/acme-2028, the page titled "Review queue".'
				},
				{ role: 'user', content: [{ type: 'text', text: 'What reviews do I have?' }] }
			])
		).toEqual({
			toolName: 'list_my_review_assignments',
			input: JSON.stringify({})
		});
	});

	it('still prefers a rename sentence over the agenda page', async () => {
		expect(
			await firstToolCall([
				{
					role: 'system',
					content: 'The user is on /manage/acme-2028/agenda'
				},
				{
					role: 'user',
					content: [{ type: 'text', text: 'Rename the conference acme-2028 to Beta Summit' }]
				}
			])
		).toEqual({
			toolName: 'update_conference',
			input: JSON.stringify({ conferenceSlug: 'acme-2028', name: 'Beta Summit' })
		});
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
