/**
 * The links a submitter typed into the form, found again when we print the answer
 * back (#477).
 *
 * A CFP form has no link field — "Link to a recording or slides" is a plain text
 * question, and what comes back is a plain text answer that happens to be a URL.
 * Printing it as body text means the one piece of evidence for how a speaker
 * actually presents has to be selected and copied by hand, on the very screen
 * where somebody is scoring them.
 *
 * This splits rather than replaces: the caller renders the pieces itself, so a URL
 * never travels as markup and there is no `{@html}` anywhere near a value a
 * stranger typed into a public form.
 */

/**
 * `http` and `https` only.
 *
 * Not "any scheme": `javascript:` and `data:` are schemes too, and an anchor is a
 * thing a reviewer clicks. Deciding that here — once, on a list of two — beats
 * deciding it again at each of the three screens that print an answer.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** What ends a sentence rather than a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/** One piece of an answer: prose, or something worth an anchor. */
export type AnswerPart = { kind: 'text'; value: string } | { kind: 'link'; value: string };

/**
 * Give back the characters a sentence put after the URL.
 *
 * The match is greedy up to whitespace, which is right for a URL sitting alone on
 * a line and wrong for one at the end of a sentence. A closing bracket goes back
 * only when the URL never opened one — "(see https://example.com/a)" ends the
 * aside, while a Wikipedia link genuinely carries its own brackets.
 */
function tidy(url: string): string {
	let end = url.replace(TRAILING_PUNCTUATION, '');
	while (end.endsWith(')') && (end.match(/\(/g)?.length ?? 0) < (end.match(/\)/g)?.length ?? 0)) {
		end = end.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
	}
	return end;
}

/**
 * An answer split into prose and links, in the order it was written.
 *
 * Always at least one part, so no caller has anything to special-case: an answer
 * without a link is one text part, an answer that is nothing but a link is one
 * link part.
 */
export function answerParts(value: string): AnswerPart[] {
	const parts: AnswerPart[] = [];
	let cursor = 0;

	for (const match of value.matchAll(URL_PATTERN)) {
		const url = tidy(match[0]);
		// `tidy` can eat the whole match only if it were punctuation alone, which the
		// pattern cannot produce — but a zero-length link would loop, so refuse it.
		if (url === '') continue;
		const start = match.index;
		if (start > cursor) parts.push({ kind: 'text', value: value.slice(cursor, start) });
		parts.push({ kind: 'link', value: url });
		cursor = start + url.length;
	}

	if (cursor < value.length) parts.push({ kind: 'text', value: value.slice(cursor) });
	return parts.length > 0 ? parts : [{ kind: 'text', value }];
}
