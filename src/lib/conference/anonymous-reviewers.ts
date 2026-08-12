/**
 * What an anonymised reviewer is called on screen (ABS-07).
 *
 * A round can hide who reviewed from their peers, but not *that* they reviewed —
 * the organizer still has to see who has and has not answered, so anonymisation
 * labels the row rather than dropping it.
 *
 * The label used to be the review's own primary key: "Reviewer 286". That is a
 * number the reader has no way to interpret, sitting next to real names, so it
 * reads as a rendering fault rather than as deliberate anonymity — and it leaks a
 * row id for no benefit. Numbering within the submission gives "Reviewer 1" and
 * "Reviewer 2" on a talk with two hidden reviewers, which is what the reader
 * needs: how many there are, and which comment belongs to which one.
 *
 * Ordered by review id so the numbering is stable. The same reviewer keeps the
 * same number across reloads, which matters because an organizer refers to them
 * out loud in a committee meeting — but the id itself never reaches the page.
 */
export function anonymousReviewerLabels(
	reviews: { id: number; anonymized: boolean }[]
): Map<number, string> {
	// Deduplicated, because callers hand this whatever they have: a review arrives
	// from the database as one row per scored criterion, and counting a reviewer
	// once per score would number the second one "Reviewer 4".
	const hidden = [
		...new Set(reviews.filter((review) => review.anonymized).map((review) => review.id))
	].sort((a, b) => a - b);

	return new Map(hidden.map((id, index) => [id, `Reviewer ${index + 1}`]));
}

/**
 * Labels every peer review as "Reviewer N" for peer-to-peer display (RV-P1-02).
 *
 * Multi-round talks used to mix real names (open rounds) with "Reviewer N"
 * (anonymised rounds) on one page — that both looks broken and undermines the
 * anonymity of any hidden round next to a named one. Numbering everyone in
 * stable review-id order is one schema for all peers; the organizer surface
 * still has real names via its own path.
 */
export function peerDisplayLabels(reviews: { id: number }[]): Map<number, string> {
	const ids = [...new Set(reviews.map((review) => review.id))].sort((a, b) => a - b);
	return new Map(ids.map((id, index) => [id, `Reviewer ${index + 1}`]));
}

/**
 * The same as `anonymousReviewerLabels`, for a list spanning several submissions.
 *
 * The grouping lives here rather than at the caller because it is part of what
 * the label means: a reviewer's queue and a single talk both print these, and
 * "Reviewer 2" has to be the second hidden reviewer *of that talk* on either
 * screen. Numbering across the whole batch would make the label depend on which
 * page you came from.
 */
export function anonymousReviewerLabelsBySubmission(
	reviews: { id: number; submissionId: number; anonymized: boolean }[]
): Map<number, string> {
	const bySubmission = new Map<number, typeof reviews>();
	for (const review of reviews) {
		bySubmission.set(review.submissionId, [
			...(bySubmission.get(review.submissionId) ?? []),
			review
		]);
	}

	const labels = new Map<number, string>();
	for (const group of bySubmission.values()) {
		for (const [id, label] of anonymousReviewerLabels(group)) labels.set(id, label);
	}

	return labels;
}
