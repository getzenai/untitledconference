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
};

/** A destination that is only shown when its flag is set; no flag means always shown. */
export type NavGate = keyof NavAccess;

/**
 * Keeps the items whose gate is open, in the order they were given.
 *
 * Generic over the item so the sidebar can keep its icons and labels in the
 * component and still have the rule live here, under test.
 */
export function visibleNavItems<T extends { gate?: NavGate }>(items: T[], access: NavAccess): T[] {
	return items.filter((item) => item.gate === undefined || access[item.gate]);
}
