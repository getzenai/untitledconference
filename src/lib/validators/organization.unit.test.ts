import { describe, expect, it } from 'vitest';
import {
	ORGANIZATION_SLUG_MAX_LENGTH,
	organizationNameSchema,
	organizationSlugSchema,
	renameOrganizationSchema,
	slugifyOrganizationName
} from './organization';

describe('organizationNameSchema', () => {
	it('trims surrounding whitespace', () => {
		expect(organizationNameSchema.parse('  Acme Inc  ')).toBe('Acme Inc');
	});

	it('rejects names that are blank or too short after trimming', () => {
		expect(organizationNameSchema.safeParse('   ').success).toBe(false);
		expect(organizationNameSchema.safeParse('a').success).toBe(false);
	});

	it('rejects names over the maximum length', () => {
		expect(organizationNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
	});
});

describe('organizationSlugSchema', () => {
	it.each(['acme', 'acme-inc', 'acme-inc-2'])('accepts %s', (slug) => {
		expect(organizationSlugSchema.safeParse(slug).success).toBe(true);
	});

	it.each(['-acme', 'acme-', 'acme--inc', 'acme inc', 'acme_inc', 'ACME!'])(
		'rejects %s',
		(slug) => {
			expect(organizationSlugSchema.safeParse(slug).success).toBe(false);
		}
	);

	it('lowercases before validating', () => {
		expect(organizationSlugSchema.parse('ACME-Inc')).toBe('acme-inc');
	});
});

describe('slugifyOrganizationName', () => {
	it('converts a display name to a URL-safe slug', () => {
		expect(slugifyOrganizationName('Acme Inc.')).toBe('acme-inc');
	});

	it('folds accented characters to their base letters', () => {
		expect(slugifyOrganizationName('Müller & Söhne')).toBe('muller-sohne');
	});

	it('collapses runs of separators and trims them from both ends', () => {
		expect(slugifyOrganizationName('  --Acme   ///   Inc--  ')).toBe('acme-inc');
	});

	it('produces a slug the schema accepts, even when truncated', () => {
		const slug = slugifyOrganizationName('a'.repeat(200));

		expect(slug.length).toBeLessThanOrEqual(ORGANIZATION_SLUG_MAX_LENGTH);
		expect(organizationSlugSchema.safeParse(slug).success).toBe(true);
	});

	it('never leaves a trailing hyphen after truncation', () => {
		const slug = slugifyOrganizationName(`${'a'.repeat(ORGANIZATION_SLUG_MAX_LENGTH - 1)} bbb`);

		expect(slug.endsWith('-')).toBe(false);
		expect(organizationSlugSchema.safeParse(slug).success).toBe(true);
	});
});

describe('renameOrganizationSchema', () => {
	it('accepts a valid payload', () => {
		const result = renameOrganizationSchema.safeParse({ organizationId: 'org1', name: 'Acme' });

		expect(result.success).toBe(true);
	});

	it('rejects a missing organization id', () => {
		expect(renameOrganizationSchema.safeParse({ organizationId: '', name: 'Acme' }).success).toBe(
			false
		);
	});
});
