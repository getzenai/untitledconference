/**
 * The speaker's own links (SPK-08), stored as JSON in `speaker_profile.links`.
 *
 * Not under `$lib/server` because the form has to draw the rows it will accept
 * before anything is posted, and the count it draws and the count the action
 * reads have to be the same number.
 *
 * The stored shape is `[{ label, url }]` rather than named `twitter`/`linkedin`
 * columns. Which network matters changes faster than a schema does, and a
 * speaker who wants their own site listed should not have to call it Twitter.
 */
export type SpeakerLink = { label: string; url: string };

/**
 * How many link rows the form offers.
 *
 * A fixed set of rows rather than add/remove buttons: this form has to work
 * before hydration, and three covers "my site, and the two networks I actually
 * use" without becoming a list manager.
 */
export const SPEAKER_LINK_ROWS = 3;

/** Reads the stored column. Anything unparseable reads as no links at all. */
export function parseSpeakerLinks(raw: string | null | undefined): SpeakerLink[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// A column that cannot be parsed is a bug somewhere upstream, but the
		// speaker's profile page is not the place to surface it as a 500 — they
		// still need to be able to fix their bio.
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	return parsed.flatMap((entry) => {
		if (typeof entry !== 'object' || entry === null) return [];
		const { label, url } = entry as Record<string, unknown>;
		if (typeof url !== 'string' || !url) return [];
		return [{ label: typeof label === 'string' ? label : '', url }];
	});
}

/**
 * Only `http:` and `https:` survive.
 *
 * This is the check that matters in this module. A link goes onto a public
 * speaker page as an `href`, so `javascript:` here is stored XSS on a page
 * anyone can visit — and unlike the bio, which is rendered as text, an href is
 * executed by the browser as an instruction.
 */
export function isPublishableUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export type LinkRowInput = { label: string; url: string };

/**
 * Turns what the form posted into what the column stores.
 *
 * A row with no URL is not an error, it is an empty row — the form always draws
 * `SPEAKER_LINK_ROWS` of them and most people fill in fewer. A row with a URL
 * that cannot be published IS an error, reported against its own row so the
 * speaker can see which one.
 */
export function collectSpeakerLinks(
	rows: LinkRowInput[]
): { ok: true; links: SpeakerLink[] } | { ok: false; index: number } {
	const links: SpeakerLink[] = [];

	for (const [index, row] of rows.entries()) {
		const url = row.url.trim();
		if (!url) continue;
		if (!isPublishableUrl(url)) return { ok: false, index };

		links.push({ label: row.label.trim() || hostLabel(url), url });
	}

	return { ok: true, links };
}

/** `null` rather than `"[]"` for no links, so "unset" is one value in the column. */
export function serializeSpeakerLinks(links: SpeakerLink[]): string | null {
	return links.length === 0 ? null : JSON.stringify(links);
}

/** A label for someone who pasted a URL and left the label blank. */
function hostLabel(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'Link';
	}
}
