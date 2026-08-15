import { error, isHttpError } from '@sveltejs/kit';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const requireReviewer = vi.hoisted(() => vi.fn());
const requireOrganizer = vi.hoisted(() => vi.fn());

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/conference/reviewer', () => ({ requireReviewer }));
vi.mock('$lib/server/conference/access', () => ({ requireOrganizer }));

import {
	handleAgendaChatRequest,
	handleReviewerChatRequest,
	readAgendaFocus,
	readChatFocus
} from './request';

const emptyUsage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 0, text: 0, reasoning: undefined }
};

function event(
	over: {
		user?: { id: string } | null;
		slug?: string;
		body?: unknown;
	} = {}
) {
	return {
		locals: {
			user: over.user === undefined ? { id: 'reviewer-1' } : over.user,
			session: null,
			organizationId: 'org-1'
		} as App.Locals,
		params: { slug: over.slug ?? 'conf-a' },
		request: new Request('http://localhost/review/conf-a/chat', {
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

describe('handleReviewerChatRequest', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.FEATURE_INAPP_CHAT;
		requireReviewer.mockReset();
	});

	it('answers 404 while FEATURE_INAPP_CHAT is off', async () => {
		try {
			await handleReviewerChatRequest(event());
			expect.unreachable('expected a 404');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(isHttpError(err) && err.status).toBe(404);
		}
		expect(requireReviewer).not.toHaveBeenCalled();
	});

	it('answers 401 when nobody is signed in', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const res = await handleReviewerChatRequest(event({ user: null }));
		expect(res.status).toBe(401);
		expect(requireReviewer).not.toHaveBeenCalled();
	});

	it('asks requireReviewer for the slug before it talks to the model', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		requireReviewer.mockResolvedValue({
			conference: { name: 'Conf A', slug: 'conf-a' },
			roundIds: [1]
		});
		await handleReviewerChatRequest(event({ body: { prompt: 'hi' } }));
		expect(requireReviewer).toHaveBeenCalledWith('reviewer-1', 'conf-a');
	});

	it('answers 400 when the body is not a messages array', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		requireReviewer.mockResolvedValue({
			conference: { name: 'Conf A', slug: 'conf-a' },
			roundIds: [1]
		});
		const res = await handleReviewerChatRequest(event({ body: { prompt: 'hi' } }));
		expect(res.status).toBe(400);
	});

	it('reads a focused review from the POST body', () => {
		expect(readChatFocus({})).toBeUndefined();
		expect(readChatFocus({ focus: { submissionId: 7 } })).toBeUndefined();
		expect(readChatFocus({ focus: { submissionId: 7, title: '  Talk  ' } })).toEqual({
			submissionId: 7,
			title: 'Talk'
		});
	});

	it('streams from a stubbed model without a Gateway key', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		requireReviewer.mockResolvedValue({
			conference: { name: 'Conf A', slug: 'conf-a' },
			roundIds: [1]
		});
		const res = await handleReviewerChatRequest(
			event({
				body: {
					messages: [
						{
							id: 'm1',
							role: 'user',
							parts: [{ type: 'text', text: 'What is still open?' }]
						}
					]
				}
			}),
			textModel('I used list_my_review_assignments.')
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('list_my_review_assignments');
	});
});

describe('handleAgendaChatRequest', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.FEATURE_INAPP_CHAT;
		requireOrganizer.mockReset();
	});

	it('answers 404 while FEATURE_INAPP_CHAT is off', async () => {
		try {
			await handleAgendaChatRequest(event());
			expect.unreachable('expected a 404');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(isHttpError(err) && err.status).toBe(404);
		}
		expect(requireOrganizer).not.toHaveBeenCalled();
	});

	it('answers 401 when nobody is signed in', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		const res = await handleAgendaChatRequest(event({ user: null }));
		expect(res.status).toBe(401);
		expect(requireOrganizer).not.toHaveBeenCalled();
	});

	// A reviewer seat is not an organizer seat: the same person may open the
	// board of a conference they only review, and the 404 has to come before the
	// model call, not from a tool halfway through an answer.
	it('passes the organizer refusal through instead of talking to the model', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		// `error()` throws rather than returns, so it belongs inside the mock body.
		requireOrganizer.mockImplementation(() => error(404, 'Conference not found'));
		const res = await handleAgendaChatRequest(event());
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('Conference not found');
	});

	it('answers 400 when the body is not a messages array', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		requireOrganizer.mockResolvedValue({
			conference: { name: 'Conf A', slug: 'conf-a' },
			via: 'org'
		});
		const res = await handleAgendaChatRequest(event({ body: { prompt: 'hi' } }));
		expect(res.status).toBe(400);
		expect(requireOrganizer).toHaveBeenCalledWith('reviewer-1', 'conf-a');
	});

	it('reads the open day from the POST body and refuses anything else', () => {
		expect(readAgendaFocus({})).toBeUndefined();
		expect(readAgendaFocus({ focus: { day: 'tomorrow' } })).toBeUndefined();
		expect(readAgendaFocus({ focus: { day: '2027-05-10' } })).toEqual({ day: '2027-05-10' });
	});

	it('streams from a stubbed model without a Gateway key', async () => {
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		requireOrganizer.mockResolvedValue({
			conference: { name: 'Conf A', slug: 'conf-a' },
			via: 'org'
		});
		const res = await handleAgendaChatRequest(
			event({
				body: {
					focus: { day: '2027-05-10' },
					messages: [
						{
							id: 'm1',
							role: 'user',
							parts: [{ type: 'text', text: 'What is on the board?' }]
						}
					]
				}
			}),
			textModel('I used get_agenda.')
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('get_agenda');
	});
});
