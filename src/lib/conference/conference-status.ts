/**
 * What the manage chrome says about a conference's life stage (#474).
 *
 * Three states — draft, published, archived — and the chrome could only tell two
 * apart: everything that was not `published` wore the same "Draft — not public
 * yet" badge, so an archived conference claimed it had never been out. Draft and
 * archived are opposite ends: one has never been public, the other is finished.
 * A badge that cannot distinguish them cannot be trusted for either.
 *
 * Pure and shared rather than inline in the two sidebars, because the desktop
 * rail and the mobile sheet render the same fact and had already drifted apart in
 * wording ("Draft — not public yet" against "Draft").
 */

export type ConferenceBadge = {
	/** Full label for the desktop rail. */
	label: string;
	/** Short label for the mobile sheet, where the rail is a strip. */
	short: string;
	/** `title`, so the badge explains itself where the label has to stay short. */
	hint: string;
};

/** `null` for a published conference: no badge is the statement that it is live. */
export function conferenceBadge(status: string): ConferenceBadge | null {
	if (status === 'published') return null;
	if (status === 'archived') {
		return {
			label: 'Archived — no longer public',
			short: 'Archived',
			hint: 'This conference is archived. Its public site is offline; restore it in Settings.'
		};
	}
	return {
		label: 'Draft — not public yet',
		short: 'Draft',
		hint: 'This conference has never been published. Publish it in Settings.'
	};
}

/**
 * What `/c/<slug>` says when it has nothing to show.
 *
 * `null` means no row at all — the genuinely unknown address, and the only case
 * the old single sentence was right about. A draft and an archived conference
 * both exist at that address; telling their visitors they mistyped it sent
 * organizers hunting for a typo that was not there.
 *
 * Still a 404 in all three cases: the page does not exist for a visitor, whatever
 * the reason. Only the sentence changes.
 */
export function missingConferenceMessage(status: string | null): string {
	if (status === 'archived') return 'This conference is archived — its public site is offline';
	if (status && status !== 'published') return 'This conference has not been published yet';
	return 'No conference with that address';
}

export type PublicSiteLink =
	| { available: true; href: string; label: string }
	| { available: false; label: string; reason: string };

/**
 * "View the public site" pointed at `/c/<slug>` whatever the status, so on a draft
 * the app's own link walked into the app-wide 404 — and that page told the
 * organizer there was no conference at that address, which was untrue.
 *
 * A link that cannot work is not made honest by a better error page. It stops
 * being a link and says why instead, next to the place that can change it.
 */
export function publicSiteLink(status: string, slug: string): PublicSiteLink {
	if (status === 'published') {
		return { available: true, href: `/c/${slug}`, label: 'View the public site' };
	}
	if (status === 'archived') {
		return {
			available: false,
			label: 'Public site offline',
			reason:
				'Archiving took the public site down. Restore this conference in Settings to bring it back.'
		};
	}
	return {
		available: false,
		label: 'No public site yet',
		reason: 'The public site goes live when you publish this conference in Settings.'
	};
}
