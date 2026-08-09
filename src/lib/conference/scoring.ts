/**
 * Turning a pile of review scores into the one number the organizer sorts by.
 *
 * Pure on purpose: ABS-04 wants the aggregate to reflect the criterion weighting,
 * and a weighted mean is exactly the kind of arithmetic that is wrong in a way
 * nobody notices until a talk is rejected. It gets its own unit test, not a
 * spot-check through a page loader.
 */

export type CriterionScore = {
	/** `null` when the reviewer left the criterion blank. Blanks do not count as zero. */
	value: number | null;
	weight: number;
	/** The scale this criterion was rated on, so 4/5 and 8/10 can be compared. */
	scaleMax: number | null;
};

export type ReviewScores = {
	/** Only reviews the reviewer actually submitted may influence the aggregate. */
	submitted: boolean;
	scores: CriterionScore[];
};

/**
 * One reviewer's verdict, on a 0..1 scale.
 *
 * Normalising by `scaleMax` before averaging is the whole reason this is a function.
 * A scorecard with "relevance 1-5" and "depth 1-10" would otherwise let the second
 * criterion outvote the first by a factor of two without anyone having weighted it so.
 */
export function reviewScore(review: ReviewScores): number | null {
	let weighted = 0;
	let weights = 0;

	for (const s of review.scores) {
		if (s.value === null || !s.scaleMax || s.scaleMax <= 0 || s.weight <= 0) continue;
		weighted += (s.value / s.scaleMax) * s.weight;
		weights += s.weight;
	}

	return weights === 0 ? null : weighted / weights;
}

/**
 * The submission's score, on the 1..5 scale the table shows.
 *
 * Reviewers count equally — the weighting is between criteria, not between people.
 * `null` means "nobody has scored this yet", which the table must render as an em
 * dash rather than as a zero: unreviewed and rated-zero are opposite situations.
 */
export function submissionScore(reviews: ReviewScores[], scaleOut = 5): number | null {
	const values = reviews
		.filter((r) => r.submitted)
		.map(reviewScore)
		.filter((v): v is number => v !== null);

	if (values.length === 0) return null;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	return mean * scaleOut;
}

/** `4.25` -> `4.3`, `null` -> `—`. One place, so every surface rounds alike. */
export function formatScore(score: number | null): string {
	return score === null ? '—' : score.toFixed(1);
}
