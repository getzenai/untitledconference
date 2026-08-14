/**
 * Which of the signed-in shell's destinations a user actually has (#239).
 *
 * The sidebar used to show Conferences, Contacts, Speaking and Reviewing to
 * everyone, on the grounds that the session carries no role and every loader is
 * safe for a user who is neither. That was the right call against a dead link and
 * the wrong one against a speaker who has never organized anything: nothing on the
 * screen told them which hat they were wearing.
 *
 * There is still no role column, and this does not invent one. The three flags are
 * derived from relations that already exist — see `navAccess` in
 * `$lib/server/conference/nav-access` for the queries. This module holds only the
 * shape and the filter, so the rule can be tested without a database.
 *
 * Speaking has no flag on purpose: anyone may submit a proposal, so `/portal` is a
 * destination for every signed-in user and a flag for it would only ever be true.
 */

/** The right to open a destination, not the presence of anything behind it. */
export type NavAccess = {
	/**
	 * `/manage`. True for an org-wide owner/admin **or** a scoped organizer on a
	 * single conference — the two sources `organizedConferences` reads.
	 *
	 * Deliberately not "organizes at least one conference": `/manage` is the only
	 * place carrying "New conference", so counting conferences would lock a fresh
	 * owner out of creating their first one.
	 */
	conferences: boolean;
	/**
	 * `/contacts`. Org-wide owner/admin only — narrower than `conferences` because
	 * the directory is org-scoped: `organizerOrganizationIds` reads Better Auth
	 * seats alone, so a scoped conference organizer sees an empty table there.
	 */
	contacts: boolean;
	/** `/review`. True with a reviewer membership on any conference or round. */
	reviewing: boolean;
	/**
	 * The conference to open when there is exactly one. The sidebar and the
	 * home "Review queue" link go straight there so a reviewer does not pay
	 * `/review`'s 303 on the common path (#373). Null when there is no seat,
	 * or more than one conference — then the URL stays `/review`.
	 */
	reviewSlug: string | null;
	/**
	 * `/portal/profile`, as the "Your speaker profile" entry in the account menu
	 * (#248) rather than a sidebar destination. True when a speaker profile
	 * exists for this account — claimed, or still unclaimed but matching the
	 * account's email, the same match `claimProfilesForAccount` performs when
	 * the portal is opened. Unlike Speaking this is gated: the page is an empty
	 * shell for anyone an organizer never named as a speaker.
	 */
	speakerProfile: boolean;
};

/** A destination that is only shown when its flag is set; no flag means always shown. */
export type NavGate = {
	[K in keyof NavAccess]: NavAccess[K] extends boolean ? K : never;
}[keyof NavAccess];

/**
 * Where Reviewing goes. One conference is a click that buys nothing — the
 * same reason `/review` 303s — but naming it on the link skips that render.
 */
export function reviewQueueHref(slug: string | null): string {
	return slug ? `/review/${slug}` : '/review';
}

/**
 * Keeps the items whose gate is open, in the order they were given.
 *
 * Generic over the item so the sidebar can keep its icons and labels in the
 * component and still have the rule live here, under test.
 */
export function visibleNavItems<T extends { gate?: NavGate }>(items: T[], access: NavAccess): T[] {
	return items.filter((item) => item.gate === undefined || access[item.gate]);
}
