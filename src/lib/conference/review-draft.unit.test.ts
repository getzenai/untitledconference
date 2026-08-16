import { readBrowserDraft, writeBrowserDraft } from '$lib/forms/browser-draft';
import { describe, expect, it } from 'vitest';
import {
	isTypedReview,
	parkableReviewDraft,
	parseReviewDraft,
	reviewDraftBaseline,
	reviewDraftScope,
	sameReviewDraft,
	type ReviewDraft
} from './review-draft';

const draft: ReviewDraft = {
	comment: 'Blameless is not the same as painless.',
	scores: { 3: '4' }
};

describe('isTypedReview', () => {
	it('treats a comment or a score as a draft, and whitespace as empty', () => {
		expect(isTypedReview({ comment: '  hello  ', scores: {} })).toBe(true);
		expect(isTypedReview({ comment: '', scores: { 1: '4' } })).toBe(true);
		expect(isTypedReview({ comment: '   ', scores: { 1: '  ' } })).toBe(false);
		expect(isTypedReview({ comment: '', scores: {} })).toBe(false);
	});
});

describe('parseReviewDraft', () => {
	it('round-trips a real draft', () => {
		expect(parseReviewDraft(draft)).toEqual(draft);
	});

	it('rejects junk so it cannot become a restored verdict', () => {
		expect(parseReviewDraft('not-json')).toBeNull();
		expect(parseReviewDraft([])).toBeNull();
		expect(parseReviewDraft(null)).toBeNull();
		expect(parseReviewDraft({ comment: 4 })).toBeNull();
	});

	it('keeps only string scores keyed by integer ids', () => {
		expect(
			parseReviewDraft({ comment: 'ok', scores: { 3: '4', nope: 'x', '2.5': '1', 7: 9 } })?.scores
		).toEqual({ 3: '4' });
	});
});

describe('parkableReviewDraft', () => {
	const relevance = { id: 3, kind: 'rating', label: 'Relevance', scaleMax: 5 };
	const notes = { id: 7, kind: 'text', label: 'Notes', scaleMax: null };
	const saved: ReviewDraft = { comment: 'Keep the 3.', scores: { 3: '3', 7: 'as filed' } };

	it('does not park a rating Save would reject', () => {
		expect(
			parkableReviewDraft({ comment: saved.comment, scores: { 3: '50', 7: 'as filed' } }, saved, [
				relevance,
				notes
			])
		).toEqual(saved);
	});

	it('keeps the comment and a score that fits, and drops only the refused rating', () => {
		expect(
			parkableReviewDraft(
				{ comment: 'Still thinking.', scores: { 3: '50', 7: 'new note' } },
				saved,
				[relevance, notes]
			)
		).toEqual({ comment: 'Still thinking.', scores: { 3: '3', 7: 'new note' } });
	});

	it('parks a rating on the scale and an emptied one — unanswered is allowed', () => {
		expect(
			parkableReviewDraft(
				{ comment: saved.comment, scores: { 3: '4', 7: saved.scores[7] } },
				saved,
				[relevance, notes]
			)
		).toEqual({ comment: saved.comment, scores: { 3: '4', 7: 'as filed' } });
		expect(
			parkableReviewDraft(
				{ comment: saved.comment, scores: { 3: '', 7: saved.scores[7] } },
				saved,
				[relevance, notes]
			)
		).toEqual({ comment: saved.comment, scores: { 3: '', 7: 'as filed' } });
	});

	it('refuses a word and a negative the same way as 50', () => {
		for (const raw of ['good', '-1']) {
			expect(
				parkableReviewDraft({ comment: saved.comment, scores: { 3: raw, 7: 'as filed' } }, saved, [
					relevance,
					notes
				])
			).toEqual(saved);
		}
	});
});

describe('sameReviewDraft', () => {
	it('treats missing and empty scores as the same box', () => {
		expect(sameReviewDraft({ comment: '', scores: {} }, { comment: '', scores: { 1: '' } })).toBe(
			true
		);
		expect(sameReviewDraft(draft, { ...draft, scores: { 3: '5' } })).toBe(false);
	});
});

describe('review draft identity', () => {
	it('names the talk and the round, not another scorecard', () => {
		expect(reviewDraftScope('devflow', 17, 2)).toBe('review:devflow:17:2');
		expect(reviewDraftScope('devflow', 17, 2)).not.toBe(reviewDraftScope('devflow', 13, 2));
		expect(reviewDraftScope('devflow', 17, 2)).not.toBe(reviewDraftScope('devflow', 17, 1));
	});

	it('changes the baseline when the saved review moves on', () => {
		const assigned = reviewDraftBaseline({ status: 'assigned', comment: '', scores: {} });
		const submitted = reviewDraftBaseline({
			status: 'submitted',
			comment: 'already filed',
			scores: { 3: '5' }
		});
		expect(assigned).not.toBe(submitted);
	});

	it('does not depend on the order the scores were written', () => {
		expect(
			reviewDraftBaseline({ status: 'assigned', comment: 'On time', scores: { 3: '4', 1: '2' } })
		).toBe(
			reviewDraftBaseline({ status: 'assigned', comment: 'On time', scores: { 1: '2', 3: '4' } })
		);
	});

	it('is the same token the server write compares', async () => {
		const { reviewWriteBaseline } = await import('./review-write-baseline');
		const input = { status: 'assigned', comment: 'On time', scores: { 3: '4', 1: '2' } };
		expect(reviewDraftBaseline(input)).toBe(reviewWriteBaseline(input));
	});
});

function fakeStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	};
}

describe('a review draft in the shared helper', () => {
	const scope = reviewDraftScope('devflow', 17, 2);
	const owner = 'reviewer-1';
	const baseline = reviewDraftBaseline({ status: 'assigned', comment: '', scores: { 3: '' } });

	it('restores a matching baseline as current', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, { scope, owner, baseline, value: draft, now: 100 });

		expect(
			readBrowserDraft(storage, { scope, owner, baseline, parse: parseReviewDraft, now: 101 })
		).toEqual({ status: 'current', draft: { value: draft, baseline, savedAt: 100 } });
	});

	it('does not silently restore over a newer saved review', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, { scope, owner, baseline, value: draft, now: 100 });
		const later = reviewDraftBaseline({
			status: 'submitted',
			comment: 'already filed',
			scores: { 3: '5' }
		});

		expect(
			readBrowserDraft(storage, {
				scope,
				owner,
				baseline: later,
				parse: parseReviewDraft,
				now: 101
			})
		).toMatchObject({ status: 'conflict', draft: { value: draft, savedAt: 100 } });
	});

	it('does not treat an identical parked draft as a choice just because the token moved', () => {
		const storage = fakeStorage();
		writeBrowserDraft(storage, { scope, owner, baseline, value: draft, now: 100 });
		const later = reviewDraftBaseline({
			status: 'submitted',
			comment: draft.comment,
			scores: draft.scores
		});
		const saved = readBrowserDraft(storage, {
			scope,
			owner,
			baseline: later,
			parse: parseReviewDraft,
			now: 101
		});
		expect(saved.status).toBe('conflict');
		if (saved.status !== 'conflict') throw new Error('expected a token conflict');
		// The helper only sees the token. The form drops this with sameReviewDraft
		// — the same proposed===current rule the server write uses.
		expect(sameReviewDraft(saved.draft.value, draft)).toBe(true);
	});
});
