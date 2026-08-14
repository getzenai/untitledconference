/**
 * How long a proposal's text may be, for the form and the server both (#470).
 *
 * The title had no limit anywhere. A ~620-character one went in through "Edit
 * talk" and then set the width of the submissions table for all thirty rows,
 * pushing Status and Notification off the screen for everybody. The render side
 * is fixed separately — a table must survive whatever is in it — but a title
 * that long is not a title, and the cheapest place to say so is where it is
 * typed.
 *
 * The number is a talk title's honest ceiling, not a database limit: the column
 * is `text`. Long enough for a real one with a subtitle, short enough that
 * hitting it means something has gone wrong.
 *
 * Not under `$lib/server`: `maxlength` has to state the rule before the
 * submitter breaks it. The server still enforces — the API takes proposals with
 * no browser in front of it.
 */
export const TALK_TITLE_MAX = 200;

/** `null` when the title fits. The sentence is shown next to the field. */
export function titleLengthError(title: string): string | null {
	if (title.trim().length <= TALK_TITLE_MAX) return null;
	return `A title can be at most ${TALK_TITLE_MAX} characters. This one is ${title.trim().length}.`;
}
