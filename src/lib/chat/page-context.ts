/**
 * What the assistant needs to resolve "can you add XY *here*" (#676).
 *
 * The title is the heading the user can actually see — the first `h1` — not
 * `document.title`, which is the tab text and often just the product name.
 * Without it "here" stays a guess, so a page without a heading sends no
 * context at all rather than half of one: the server drops an incomplete
 * block anyway and still answers.
 */
/** What the server accepts per field; see `focusFields`. */
const MAX_FOCUS_LENGTH = 240;

export interface PageContext {
	routeId: string;
	url: string;
	title: string;
	params: Record<string, string>;
	/**
	 * What the route alone does not say: the day the agenda board has open, the
	 * review round a scorecard is for (#683). Route and heading describe *which*
	 * page; this describes what is selected on it, which is the half of "move it
	 * to 14:00" that lives in the screen rather than in the URL.
	 *
	 * Absent when the page reports nothing — an empty object never travels.
	 */
	focus?: Record<string, string>;
}

interface PageContextInput {
	routeId: string | null | undefined;
	url: URL | string;
	params: Record<string, string | undefined>;
	title: string | null | undefined;
	focus?: Record<string, string | number | null | undefined>;
}

/**
 * The visible heading of the page, or null when it has none.
 *
 * Hidden headings (`aria-hidden`, or a `sr-only`-style visually hidden one)
 * are still read: they name the page for a screen reader, which is exactly
 * the naming the model wants.
 */
export function visiblePageTitle(root: Pick<Document, 'querySelector'>): string | null {
	const heading = root.querySelector('h1');
	const text = heading?.textContent?.replace(/\s+/g, ' ').trim();
	return text ? text : null;
}

/**
 * Route, url, title and params or nothing — see the note on `PageContext`.
 * The focus is the one optional part: a page that has nothing selected still
 * says where it is.
 */
export function pageContext(input: PageContextInput): PageContext | undefined {
	const routeId = input.routeId?.trim();
	const title = input.title?.replace(/\s+/g, ' ').trim();
	if (!routeId || !title) return undefined;

	const url = typeof input.url === 'string' ? input.url : input.url.href;
	if (!url) return undefined;

	// `Record<string, string>` on the wire: route params arrive as strings, and
	// an optional param that did not match is absent, not `undefined`.
	const params: Record<string, string> = {};
	for (const [key, value] of Object.entries(input.params)) {
		if (typeof value === 'string') params[key] = value;
	}

	const focus = focusFields(input.focus);
	return focus ? { routeId, url, title, params, focus } : { routeId, url, title, params };
}

/**
 * The selected values a page offers, as strings the prompt can print.
 *
 * A number is spelled out rather than dropped — `roundId: 4` is exactly the
 * kind of thing a page has and a sentence needs. Anything null, undefined or
 * blank is left out: a key with nothing behind it would read to the model as
 * "there is a day, and it is empty".
 *
 * A value longer than the server accepts is dropped here rather than sent.
 * The server answers an over-long field by discarding the whole block, so a
 * page that gets carried away would cost itself the route and the heading too.
 */
function focusFields(
	input: Record<string, string | number | null | undefined> | undefined
): Record<string, string> | undefined {
	if (!input) return undefined;
	const focus: Record<string, string> = {};
	for (const [key, value] of Object.entries(input)) {
		if (value == null) continue;
		const text = typeof value === 'number' ? String(value) : value.replace(/\s+/g, ' ').trim();
		if (text && text.length <= MAX_FOCUS_LENGTH) focus[key] = text;
	}
	return Object.keys(focus).length > 0 ? focus : undefined;
}
