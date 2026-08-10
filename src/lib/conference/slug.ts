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
