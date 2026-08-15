/**
 * What a `submit_review` call will do, and what it did.
 *
 * The MCP tool returns `{ submissionId, submitted }`. The title and scores
 * live on the call the reviewer is about to approve — that is what the
 * confirmation and the history line have to name (#302).
 */
export type ReviewWriteInput = {
	submissionId?: number;
	answers?: Record<string, string>;
	comment?: string;
};

function talkName(input: ReviewWriteInput, title?: string): string {
	const named = title?.trim();
	if (named) return named;
	if (input.submissionId != null) return `submission ${input.submissionId}`;
	return 'this review';
}

function scores(input: ReviewWriteInput): string[] {
	return Object.values(input.answers ?? {}).filter((value) => value.trim() !== '');
}

/** Shown on the confirmation, before anything is written. */
export function previewReviewWrite(input: ReviewWriteInput, title?: string): string {
	const bits = [
		scores(input).length ? `scores ${scores(input).join(', ')}` : null,
		input.comment?.trim() ? `comment: ${input.comment.trim()}` : null
	].filter(Boolean);
	return bits.length
		? `This will file a review of ${talkName(input, title)} (${bits.join('; ')}).`
		: `This will file a review of ${talkName(input, title)}.`;
}

/** The history line after a confirmed write. */
export function describeReviewWrite(input: ReviewWriteInput, title?: string): string {
	const marks = scores(input);
	return marks.length === 1
		? `Saved review of ${talkName(input, title)}: ${marks[0]}`
		: marks.length > 1
			? `Saved review of ${talkName(input, title)}: ${marks.join(', ')}`
			: `Saved review of ${talkName(input, title)}`;
}
