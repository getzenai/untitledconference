/**
 * The typed scorecard as a serializable snapshot (#737).
 *
 * Storage is `$lib/forms/browser-draft`. This file only knows what a review
 * draft looks like, when it counts as typed, and how to name the scope and
 * baseline so a later server version cannot be silently overwritten.
 */

export type ReviewDraft = {
	comment: string;
	scores: Record<number, string>;
};

export function reviewDraftScope(slug: string, submissionId: number, roundId: number): string {
	return `review:${slug}:${submissionId}:${roundId}`;
}

/** Identity of the server scorecard this draft was typed from. */
export function reviewDraftBaseline(input: {
	status: string;
	comment: string;
	scores: Record<number, string>;
}): string {
	return JSON.stringify(input);
}

/** A comment or any filled criterion — an empty form is not a draft. */
export function isTypedReview(draft: ReviewDraft): boolean {
	return Boolean(draft.comment.trim() || Object.values(draft.scores).some((value) => value.trim()));
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asScores(value: unknown): Record<number, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const out: Record<number, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		const id = Number(key);
		if (Number.isInteger(id) && typeof entry === 'string') out[id] = entry;
	}
	return out;
}

/** The helper's `parse` callback: a usable draft, or nothing. */
export function parseReviewDraft(value: unknown): ReviewDraft | null {
	const row = asRecord(value);
	if (!row) return null;
	const draft: ReviewDraft = {
		comment: typeof row.comment === 'string' ? row.comment : '',
		scores: asScores(row.scores)
	};
	return isTypedReview(draft) ? draft : null;
}

export function sameReviewDraft(a: ReviewDraft, b: ReviewDraft): boolean {
	if (a.comment !== b.comment) return false;
	const keys = new Set([...Object.keys(a.scores), ...Object.keys(b.scores)]);
	for (const key of keys) {
		const id = Number(key);
		if ((a.scores[id] ?? '') !== (b.scores[id] ?? '')) return false;
	}
	return true;
}
