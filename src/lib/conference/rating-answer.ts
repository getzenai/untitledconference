/**
 * A number typed into a scorecard's rating field (#477).
 *
 * The reviewer's page used to leave this to the browser: `min`, `max`, and
 * whatever bubble the browser felt like drawing — "Value must be less than or
 * equal to 5", in the operating system's font, in the operating system's
 * English, on a page that has its own way of saying things. Worse, the bubble
 * was the only thing standing between a 7 and the database: `ratingValue`
 * drops an out-of-scale number rather than clamping it, so a reviewer who got
 * past the bubble at all — no JavaScript, an autofilled field, a second tab —
 * saved a review with that criterion silently blank.
 *
 * So the rule lives here, in one place both sides read: the form asks it to
 * draw the message, and `saveReview` asks it again before writing, because a
 * check the browser performs is a courtesy and not a guard.
 */

export type RatingCriterion = { label: string; scaleMax: number | null };

/**
 * What is wrong with this answer, or null if nothing is.
 *
 * An empty field is not wrong — "not answered" is a legitimate state of a
 * scorecard, and only a wholly empty *submit* is refused (`hasSomethingToSay`).
 * Zero is not wrong either: the stored range has always started there, whatever
 * the label above the field says about counting from one.
 */
export function ratingAnswerError(raw: string, criterion: RatingCriterion): string | null {
	const value = raw.trim();
	if (value === '') return null;

	const number = Number(value);
	if (!Number.isFinite(number)) {
		return `${criterion.label} takes a number.`;
	}
	if (number < 0) {
		return `${criterion.label} does not go below 0.`;
	}
	if (criterion.scaleMax !== null && number > criterion.scaleMax) {
		return `${criterion.label} is scored out of ${criterion.scaleMax}, so ${value} is off the scale.`;
	}
	return null;
}
