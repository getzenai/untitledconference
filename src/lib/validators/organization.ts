import { z } from 'zod/v4';

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_NAME_MAX_LENGTH = 100;
export const ORGANIZATION_SLUG_MAX_LENGTH = 60;

export const organizationNameSchema = z
	.string()
	.trim()
	.min(
		ORGANIZATION_NAME_MIN_LENGTH,
		`Name must be at least ${ORGANIZATION_NAME_MIN_LENGTH} characters`
	)
	.max(
		ORGANIZATION_NAME_MAX_LENGTH,
		`Name must be at most ${ORGANIZATION_NAME_MAX_LENGTH} characters`
	);

/**
 * URL-safe organization identifier: lowercase alphanumerics separated by single
 * hyphens, no leading or trailing hyphen.
 */
export const organizationSlugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Slug is required')
	.max(
		ORGANIZATION_SLUG_MAX_LENGTH,
		`Slug must be at most ${ORGANIZATION_SLUG_MAX_LENGTH} characters`
	)
	.regex(
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
		'Slug may contain only lowercase letters, numbers and single hyphens'
	);

/** Derives a candidate slug from a display name. Callers must still ensure uniqueness. */
export function slugifyOrganizationName(name: string): string {
	return (
		name
			.trim()
			.toLowerCase()
			.normalize('NFKD')
			// Strip combining marks so "Müller" becomes "muller" rather than "mller".
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
			.replace(/-+$/g, '')
	);
}

export const renameOrganizationSchema = z.object({
	organizationId: z.string().min(1, 'Missing organization'),
	name: organizationNameSchema
});
