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
	readAssistantPage,
	reviewerFocusFromPage
} from './assistant';
import {
	ASSISTANT_AUTO_RUN_WRITES,
	assistantChatToolDefinitions,
	assistantChatWriteToolNames,
	assistantWriteNeedsApproval
} from './tools';

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
		expect(prompt).toContain('Never mention internal database IDs');
		expect(prompt).toContain('Main Stage');
		expect(prompt).toContain('Do not ask in prose whether to make a change');
		expect(prompt).not.toContain('Every write waits for explicit user approval');
		expect(prompt).not.toContain('Before requesting approval');
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

	it('tells the model what the page has selected', () => {
		const page = readAssistantPage({
			pageContext: {
				routeId: '/(protected)/manage/[slug]/agenda',
				url: 'https://conference.test/manage/devflow-conf-2027/agenda',
				title: 'Agenda',
				params: { slug: 'devflow-conf-2027' },
				focus: { day: '2027-05-04' }
			}
		});
		expect(page?.focus).toEqual({ day: '2027-05-04' });

		const prompt = assistantSystemPrompt(page);
		expect(prompt).toContain('"day"="2027-05-04"');
		// The warning has to come after the selection, or it does not cover it.
		expect(prompt.indexOf('"day"="2027-05-04"')).toBeLessThan(
			prompt.indexOf('untrusted navigation context')
		);
	});

	it('drops the whole block when the focus is not a map of short strings', () => {
		const base = {
			routeId: '/(protected)/manage/[slug]/agenda',
			url: 'https://conference.test/manage/devflow-conf-2027/agenda',
			title: 'Agenda',
			params: { slug: 'devflow-conf-2027' }
		};
		expect(readAssistantPage({ pageContext: { ...base, focus: { day: { nested: 1 } } } })).toBe(
			undefined
		);
		expect(readAssistantPage({ pageContext: { ...base, focus: 'day' } })).toBeUndefined();
		expect(readAssistantPage({ pageContext: { ...base, focus: { day: 'ab' } } })).toBe(undefined);
		// Nothing selected is not malformed: the page still says where it is.
		expect(readAssistantPage({ pageContext: { ...base, focus: {} } })?.focus).toBeUndefined();
	});

	it('binds the scorecard round only when both halves are whole positive numbers', () => {
		const page = (focus: Record<string, string>) => ({
			routeId: '/(protected)/(with-sidebar)/review/[slug]/[submissionId]',
			url: '/review/devflow-conf-2027/42',
			title: 'Review',
			params: { slug: 'devflow-conf-2027', submissionId: '42' },
			focus
		});
		expect(reviewerFocusFromPage(page({ submissionId: '42', roundId: '4' }))).toEqual({
			submissionId: 42,
			roundId: 4
		});
		expect(reviewerFocusFromPage(page({ submissionId: '42' }))).toBeUndefined();
		expect(reviewerFocusFromPage(page({ submissionId: '42', roundId: '0' }))).toBeUndefined();
		expect(reviewerFocusFromPage(page({ submissionId: 'all', roundId: '4' }))).toBeUndefined();
		expect(reviewerFocusFromPage(undefined)).toBeUndefined();
	});

	it('puts every write in exactly one bucket and fails closed for a new name', () => {
		const ctx = { userId: 'user-1', organizationId: 'org-1' };
		const writes = assistantChatWriteToolNames(ctx);
		const auto = writes.filter((name) => !assistantWriteNeedsApproval(name)).sort();
		const gated = writes.filter(assistantWriteNeedsApproval).sort();

		expect([...auto, ...gated].sort()).toEqual([...writes].sort());
		expect(auto.filter((name) => gated.includes(name))).toEqual([]);
		expect(auto).toEqual([...ASSISTANT_AUTO_RUN_WRITES]);
		expect(gated).toEqual([
			'archive_conference',
			'close_cfp',
			'decide_submissions',
			'delete_cfp_field',
			'delete_conference',
			'finalize_proposal',
			'notify_speakers',
			'open_cfp',
			'publish_conference',
			'unpublish_conference',
			'withdraw_proposal'
		]);

		expect(assistantWriteNeedsApproval('brand_new_write_tool')).toBe(true);
		expect(assistantWriteNeedsApproval('move_talk')).toBe(false);

		const approval = assistantToolApproval(ctx);
		expect(Object.keys(approval).sort()).toEqual(gated);
		for (const tool of assistantChatToolDefinitions(ctx)) {
			expect(approval[tool.name]).toBe(
				tool.writes && assistantWriteNeedsApproval(tool.name) ? 'user-approval' : undefined
			);
		}
	});
});
