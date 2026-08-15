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
 *
 * Hiding is not the same as saying nothing (#439). A brand-new account saw one
 * entry, and after creating an organization it saw three, with nothing before or
 * after to explain the jump — the sidebar is where a new organizer learns the shape
 * of the product, and two thirds of it were invisible. So a destination whose gate
 * the person can open themselves is *shown locked*, with the reason and a link to
 * the form that opens it. Reviewing stays hidden: no form makes you a reviewer,
 * somebody has to invite you, and a permanently locked entry is only noise.
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
	/**
	 * Any organization seat at all, whatever the role. Not a right — it is what
	 * separates "you can open this yourself" from "someone has to let you in"
	 * (#439): with no seat, the organizer destinations are one form away, and the
	 * sidebar says so. With a seat but no organizer role, the missing thing is a
	 * colleague's decision, so the entry stays hidden rather than pointing at a
	 * form that would create a second organization.
	 */
	organization: boolean;
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

/** Why a shown destination cannot be opened yet, and where the person opens it. */
export type NavLock = {
	/** Written for someone who has never seen the product: what to do, not what failed. */
	reason: string;
	/** The form that opens the gate. */
	href: string;
};

/** A destination the sidebar should render, and whether it is still locked. */
export type NavDestination<T> = T & { lock: NavLock | null };

/** Path, or path plus a hash (`/contacts/pipeline#pipeline-enroll`). */
function parseNavUrl(url: string): { path: string; hash: string } {
	const hashIndex = url.indexOf('#');
	if (hashIndex === -1) return { path: url, hash: '' };
	return { path: url.slice(0, hashIndex), hash: url.slice(hashIndex) };
}

/**
 * Which item in a sibling group is current. A more specific sibling wins, so
 * `/contacts` does not light up on `/contacts/pipeline` (#420). Hash-only
 * siblings on the same path (Enrollment vs Sourcing) split the same way.
 *
 * `siblings` is the whole group, including `itemUrl`; order does not matter.
 */
export function isNavUrlCurrent(
	pathname: string,
	itemUrl: string,
	siblings: string[],
	hash = ''
): boolean {
	const item = parseNavUrl(itemUrl);
	const currentHash = hash.startsWith('#') || hash === '' ? hash : `#${hash}`;

	if (item.hash) {
		return pathname === item.path && currentHash === item.hash;
	}

	const matchesPath = pathname === item.path || pathname.startsWith(`${item.path}/`);
	if (!matchesPath) return false;

	if (
		siblings.some((candidate) => {
			const other = parseNavUrl(candidate);
			return other.path === item.path && other.hash !== '' && other.hash === currentHash;
		})
	) {
		return false;
	}

	return !siblings.some((candidate) => {
		const other = parseNavUrl(candidate);
		if (other.hash || other.path.length <= item.path.length) return false;
		return pathname === other.path || pathname.startsWith(`${other.path}/`);
	});
}

/**
 * The sidebar's list: open destinations, plus the ones the person can unlock
 * themselves, in the order they were given.
 *
 * Three cases, and the third is the whole point of the file:
 * - no gate, or an open gate → shown, `lock: null`;
 * - a closed gate the person can open (`unlock`, and no organization yet) →
 *   shown with the reason;
 * - any other closed gate → dropped, as before.
 *
 * Generic over the item so the sidebar can keep its icons and labels in the
 * component and still have the rule live here, under test.
 */
export function navDestinations<T extends { gate?: NavGate; unlock?: NavLock }>(
	items: T[],
	access: NavAccess
): NavDestination<T>[] {
	return items.flatMap((item): NavDestination<T>[] => {
		if (item.gate === undefined || access[item.gate]) return [{ ...item, lock: null }];
		if (item.unlock && !access.organization) return [{ ...item, lock: item.unlock }];
		return [];
	});
}
