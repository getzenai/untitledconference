import { isHttpError } from '@sveltejs/kit';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import {
	assistantSystemPrompt,
	assistantToolApproval,
	handleAssistantChatRequest,
	readAssistantPage
} from './assistant';
import { assistantChatToolDefinitions, assistantChatWriteToolNames } from './tools';

const emptyUsage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 0, text: 0, reasoning: undefined }
};

function event(over: { user?: { id: string } | null; body?: unknown } = {}) {
	return {
		locals: {
			user: over.user === undefined ? { id: 'user-1' } : over.user,
			session: null,
			organizationId: 'org-1'
		} as App.Locals,
		request: new Request('http://localhost/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(over.body ?? { messages: [] })
		})
	};
}

function textModel(delta: string) {
	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start' as const, warnings: [] },
					{ type: 'text-start' as const, id: 't1' },
					{ type: 'text-delta' as const, id: 't1', delta },
					{ type: 'text-end' as const, id: 't1' },
					{ type: 'finish' as const, finishReason: 'stop' as const, usage: emptyUsage }
				] as never
			})
		})
	});
}

describe('assistant chat', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.FEATURE_INAPP_CHAT;
	});

	it('answers 404 while the feature is off', async () => {
		try {
			await handleAssistantChatRequest(event());
			expect.unreachable('expected a 404');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			expect(isHttpError(error) && error.status).toBe(404);
		}
	});

	it('requires a signed-in user before parsing or streaming', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const response = await handleAssistantChatRequest(event({ user: null }));
		expect(response.status).toBe(401);
	});

	it('requires a messages array', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const response = await handleAssistantChatRequest(event({ body: { prompt: 'hello' } }));
		expect(response.status).toBe(400);
	});

	it('streams for any signed-in user without a conference gate', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const response = await handleAssistantChatRequest(
			event({
				body: {
					messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Help' }] }],
					pageContext: {
						routeId: '/(protected)/manage/[slug]/agenda',
						url: '/manage/devflow-conf-2027/agenda?day=2027-05-10',
						title: 'Agenda board for DevFlow Conf 2027',
						params: { slug: 'devflow-conf-2027' }
					}
				}
			}),
			textModel('Ready.')
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Ready.');
	});

	it('turns a valid page block into bounded navigation context', () => {
		const page = readAssistantPage({
			pageContext: {
				routeId: '/(protected)/manage/[slug]/agenda',
				url: 'https://conference.test/manage/devflow-conf-2027/agenda?day=1',
				title: 'Agenda board for DevFlow Conf 2027',
				params: { slug: 'devflow-conf-2027' }
			}
		});
		expect(page).toEqual({
			routeId: '/(protected)/manage/[slug]/agenda',
			url: '/manage/devflow-conf-2027/agenda?day=1',
			title: 'Agenda board for DevFlow Conf 2027',
			params: { slug: 'devflow-conf-2027' }
		});

		const prompt = assistantSystemPrompt(page);
		expect(prompt).toContain('The user is on /manage/devflow-conf-2027/agenda?day=1');
		expect(prompt).toContain('"slug"="devflow-conf-2027"');
		expect(prompt).toContain('untrusted navigation context');
		expect(prompt).toContain('at most once per conversation');
		expect(prompt).toContain('Never put a goose aside');
	});

	it('drops a malformed page block without rejecting the request', async () => {
		expect(
			readAssistantPage({
				pageContext: {
					routeId: '/manage/[slug]',
					url: 'javascript:alert(1)',
					title: 'Manage',
					params: { slug: 'conf' }
				}
			})
		).toBeUndefined();

		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const response = await handleAssistantChatRequest(
			event({
				body: {
					messages: [
						{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Can you do this here?' }] }
					],
					pageContext: { routeId: 7, url: {}, title: null, params: 'conf' }
				}
			}),
			textModel('Please tell me which page you mean.')
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('which page');
	});

	it('requires approval for every registry write and no registry read', () => {
		const ctx = { userId: 'user-1', organizationId: 'org-1' };
		const approval = assistantToolApproval(ctx);
		expect(Object.keys(approval).sort()).toEqual(assistantChatWriteToolNames(ctx).sort());
		for (const tool of assistantChatToolDefinitions(ctx)) {
			expect(approval[tool.name]).toBe(tool.writes ? 'user-approval' : undefined);
		}
	});
});
