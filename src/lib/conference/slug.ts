/**
 * The rule for a conference's public address, stated once.
 *
 * Not under `$lib/server` because the new-conference form suggests a slug while
 * the organizer types and shows them the address before they commit to it. The
 * server validates whatever is actually submitted — this module is the single
 * place the shape of a slug is written down.
 */

export const MAX_SLUG_LENGTH = 60;

/** Lowercase letters, digits and single hyphens — what fits in a URL unescaped. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs that a route already owns.
 *
 * `/manage/new` is a real page and `/manage/[slug]` is the conference. SvelteKit
 * matches the literal segment first — the compiled route table lists
 * `\/manage\/new\/?$` above `\/manage\/([^/]+?)\/?$` — so a conference whose
 * slug is `new` is not merely confusing, it is unreachable: every visit to its
 * management page renders the create form instead.
 *
 * A conference called "New" slugifies to exactly that, so this is a name an
 * organizer can pick by accident and then be unable to open. Refusing it at the
 * point of naming costs one sentence; discovering it afterwards costs a
 * conference nobody can administer, because renaming is not a thing the product
 * offers.
 *
 * Only `/manage` has a literal sibling today. `/c/[slug]` has none, and the
 * public surfaces are all nested under it.
 */
export const RESERVED_SLUGS = ['new'] as const;

/** Spelled like a slug: the right characters, short enough for a URL. */
export function hasSlugShape(slug: string): boolean {
	return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * Kept separate from the shape check on purpose.
 *
 * `new` is spelled perfectly — telling its author to "use lowercase letters and
 * hyphens" would be a lie about an address that breaks no such rule. The two
 * failures need two messages, so they need two questions.
 */
export function isReservedSlug(slug: string): boolean {
	return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

/**
 * A slug suggestion from a conference name.
 *
 * The trailing-hyphen trim runs again after the length cut: slicing can leave a
 * hyphen at the end, and `conference-2027-` is not a valid slug even though
 * everything before the slice was.
 */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/g, '');
}
