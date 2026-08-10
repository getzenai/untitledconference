/**
 * The five public surfaces, named once (EMB-15).
 *
 * Two very different readers share this list, and that is the point: the public
 * layout builds its tab bar from it, and the organizer's "Embed & share" page
 * builds its URLs and iframe snippets from it. A share page that offers a widget
 * the site does not have — or a site that grows a sixth tab nobody can embed —
 * is drift, and drift is what one list prevents.
 *
 * A third reader is the security-headers hook: `isEmbeddableSurface` decides
 * which documents may be framed. That is why this module imports nothing. It
 * runs inside the outermost server handler on every single request.
 */

export type EmbeddableSurface = {
	/** Appended to `/c/<slug>`; the empty string is the index. */
	readonly path: string;
	readonly label: string;
	/** What an organizer would be embedding, in their words, not ours. */
	readonly description: string;
	/** Starting height for the snippet. A guess an organizer can edit, not a promise. */
	readonly height: number;
};

export const EMBEDDABLE_SURFACES: readonly EmbeddableSurface[] = [
	{
		path: '',
		label: 'Sessions',
		description: 'The full session list with search and track, format and room filters.',
		height: 900
	},
	{
		path: '/agenda',
		label: 'Agenda',
		description: 'The grid: rooms across, time down, one day at a time.',
		height: 1000
	},
	{
		path: '/itinerary',
		label: 'Itinerary',
		description: 'A chronological day list a visitor can star to build their own schedule.',
		height: 900
	},
	{
		path: '/speakers',
		label: 'Speakers',
		description: 'The speaker directory, searchable by name, linking to each speaker page.',
		height: 800
	},
	{
		path: '/gallery',
		label: 'Gallery',
		description: 'The photo wall — headshots, names and titles, with a detail dialog.',
		height: 800
	}
];

/**
 * Marks a request as coming from inside an embed, so the layout can drop the
 * site chrome. Presentation only: it is not a permission, and nothing may be
 * decided by it that an attacker must not decide for themselves by typing it
 * into the address bar.
 */
export const EMBED_PARAM = 'embed';

/** Keeps `?embed=1` on links followed inside an iframe, so the chrome stays off. */
export function withEmbed(href: string, embed: boolean): string {
	return embed ? `${href}?${EMBED_PARAM}=1` : href;
}

export function surfaceUrl(origin: string, slug: string, path: string): string {
	return `${origin}/c/${slug}${path}`;
}

export function embedUrl(origin: string, slug: string, path: string): string {
	return withEmbed(surfaceUrl(origin, slug, path), true);
}

/**
 * Escapes a value that is about to sit inside a double-quoted HTML attribute.
 *
 * This function builds a string of HTML that we hand to somebody to paste into
 * a page we do not control, and Svelte's own escaping does not reach it: the
 * page renders the snippet as text, and the browser only parses it later, on
 * someone else's site. Slug and origin are the two values that come from
 * outside — the origin from the request's host header, the slug from whatever
 * a conference is one day allowed to be named. Neither can end the attribute
 * here.
 */
function attr(value: string | number): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * The snippet an organizer pastes into their own site.
 *
 * `title` because a frame without one is a hole in a screen reader's outline,
 * and this is a page we are asking someone else to put on their site — the
 * accessibility of it stops being our page's problem and becomes our reputation.
 */
export function embedSnippet(origin: string, slug: string, surface: EmbeddableSurface): string {
	return [
		`<iframe src="${attr(embedUrl(origin, slug, surface.path))}"`,
		`        title="${attr(surface.label)}"`,
		`        width="100%" height="${attr(surface.height)}"`,
		`        style="border:0" loading="lazy"></iframe>`
	].join('\n');
}

const SPEAKER_DETAIL = /^\/speakers\/[^/]+$/;

/**
 * Whether this path is one of the surfaces we invite other sites to frame.
 *
 * An allowlist rather than a look at `?embed=1`, because the query string is the
 * attacker's to write too: keying the header off it would let anyone frame any
 * page in the app by appending five characters. What may be framed has to be a
 * property of the page, and these pages are readable by anyone with no session,
 * carry no form and no internal field. The speaker detail page is included
 * because the directory links to it, and a frame that dead-ends on its own links
 * is worse than no frame.
 */
export function isEmbeddableSurface(pathname: string): boolean {
	const match = /^\/c\/[^/]+(\/.*)?$/.exec(pathname.replace(/\/$/, '') || '/');
	if (!match) return false;

	const rest = match[1] ?? '';
	return EMBEDDABLE_SURFACES.some((surface) => surface.path === rest) || SPEAKER_DETAIL.test(rest);
}
