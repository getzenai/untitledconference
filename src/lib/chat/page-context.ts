/**
 * What the assistant needs to resolve "can you add XY *here*" (#676).
 *
 * The title is the heading the user can actually see — the first `h1` — not
 * `document.title`, which is the tab text and often just the product name.
 * Without it "here" stays a guess, so a page without a heading sends no
 * context at all rather than half of one: the server drops an incomplete
 * block anyway and still answers.
 */
export interface PageContext {
	routeId: string;
	url: string;
	title: string;
	params: Record<string, string>;
}

interface PageContextInput {
	routeId: string | null | undefined;
	url: URL | string;
	params: Record<string, string | undefined>;
	title: string | null | undefined;
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
 * All four fields or nothing — see the note on `PageContext`.
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

	return { routeId, url, title, params };
}
