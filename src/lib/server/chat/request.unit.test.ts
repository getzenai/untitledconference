import { isHttpError } from '@sveltejs/kit';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const requireReviewer = vi.hoisted(() => vi.fn());

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/conference/reviewer', () => ({ requireReviewer }));

import { handleReviewerChatRequest, readChatFocus } from './request';

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
