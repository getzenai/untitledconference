/**
 * Starting a conference — the step a new organizer could not take at all.
 *
 * The assertions that matter are the two refusals. A conference nobody can
 * create is a visible failure; a conference created by the wrong person, or one
 * that quietly takes over another organization's public address, is not.
 */
import { slugify } from '$lib/conference/slug';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createConference, organizationForNewConference } from './create-conference';

const suffix = `mkconf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerId = `owner-${suffix}`;
const plainMemberId = `plain-${suffix}`;
const outsiderId = `outsider-${suffix}`;
const orgId = `org-${suffix}`;
const otherOrgId = `org-other-${suffix}`;

const created: number[] = [];

async function create(userId: string, over: Partial<Parameters<typeof createConference>[1]> = {}) {
	const result = await createConference(userId, {
		name: 'DevFlow Conf 2028',
		slug: `devflow-2028-${suffix}`,
		startsOn: '2028-05-12',
		endsOn: '2028-05-14',
		...over
	});
	if (result.ok) created.push(result.conference.id);
	return result;
}

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: orgId, name: 'Owner Org', slug: orgId, createdAt: new Date() },
		{ id: otherOrgId, name: 'Other Org', slug: otherOrgId, createdAt: new Date() }
	]);

	await db.insert(user).values([
		{ id: ownerId, email: `${ownerId}@example.test`, emailVerified: true, name: 'Owner' },
		{
			id: plainMemberId,
			email: `${plainMemberId}@example.test`,
			emailVerified: true,
			name: 'Member'
		},
		{ id: outsiderId, email: `${outsiderId}@example.test`, emailVerified: true, name: 'Outsider' }
	]);

	await db.insert(member).values([
		{
			id: `seat-owner-${suffix}`,
			organizationId: orgId,
			userId: ownerId,
			role: 'owner',
			createdAt: new Date()
		},
		{
			id: `seat-plain-${suffix}`,
			organizationId: otherOrgId,
			userId: plainMemberId,
			role: 'member',
			createdAt: new Date()
		}
	]);
});

afterAll(async () => {
	for (const id of created) await db.delete(conferenceTable).where(eq(conferenceTable.id, id));
	await db.delete(member).where(eq(member.userId, ownerId));
	await db.delete(member).where(eq(member.userId, plainMemberId));
	for (const id of [orgId, otherOrgId]) {
		await db.delete(organization).where(eq(organization.id, id));
	}
	for (const id of [ownerId, plainMemberId, outsiderId]) {
		await db.delete(user).where(eq(user.id, id));
	}
});

describe('createConference', () => {
	it('creates a draft under the organization the user owns', async () => {
		const result = await create(ownerId);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.conference.organizationId).toBe(orgId);
		expect(result.conference.slug).toBe(`devflow-2028-${suffix}`);
		expect(result.conference.startsOn).toBe('2028-05-12');
		// Draft, not published: a conference is not public the moment it is named.
		expect(result.conference.status).toBe('draft');
	});

	it('refuses the address a conference already answers to', async () => {
		// Not a cosmetic clash. `access.ts` and `public-conference.ts` both resolve a
		// bare slug with limit(1), so a duplicate would show one organization's
		// event under another's link instead of colliding.
		const result = await create(ownerId, { name: 'Impostor' });

		expect(result).toMatchObject({ ok: false, reason: 'slug_taken', field: 'slug' });

		const rows = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, `devflow-2028-${suffix}`));
		expect(rows).toHaveLength(1);
	});

	it('refuses a plain member of an organization', async () => {
		// Better Auth's `member` seat is not an organizer seat, and the scoped
		// `organizer` role is granted *on* a conference — neither can start one.
		const result = await create(plainMemberId, { slug: `plain-tried-${suffix}` });
		expect(result).toMatchObject({ ok: false, reason: 'no_organization' });
	});

	it('refuses someone who belongs to no organization', async () => {
		const result = await create(outsiderId, { slug: `outsider-tried-${suffix}` });
		expect(result).toMatchObject({ ok: false, reason: 'no_organization' });
	});

	it('rejects a malformed address before it reaches the database', async () => {
		for (const slug of ['Has Spaces', 'UPPER', 'trailing-', 'double--hyphen', '']) {
			expect(await create(ownerId, { slug })).toMatchObject({
				ok: false,
				reason: 'invalid',
				field: 'slug'
			});
		}
	});

	it('rejects a date that is not a date, instead of letting Postgres do it', async () => {
		// Without this the value travelled to Postgres, which threw through the
		// server action and turned a typo into a 500. `type="date"` in the browser
		// is not a guarantee: a posted form carries whatever was sent.
		for (const startsOn of ['not-a-date', '12/05/2028', '2028-5-1', '2028-05-12T10:00:00Z']) {
			expect(await create(ownerId, { slug: `bad-start-${suffix}`, startsOn })).toMatchObject({
				ok: false,
				reason: 'invalid',
				field: 'startsOn'
			});
		}

		expect(
			await create(ownerId, { slug: `bad-end-${suffix}`, endsOn: 'sometime in May' })
		).toMatchObject({ ok: false, reason: 'invalid', field: 'endsOn' });
	});

	it('rejects a day the calendar does not have', async () => {
		// The shape is right and the pattern passes; only the calendar disagrees.
		// `new Date` would roll this into 3 March rather than refuse it, so a
		// pattern check alone would store a date nobody typed.
		expect(
			await create(ownerId, { slug: `feb31-${suffix}`, startsOn: '2028-02-31' })
		).toMatchObject({ ok: false, reason: 'invalid', field: 'startsOn' });

		// And the leap day that does exist is accepted — 2028 is a leap year.
		expect(
			await create(ownerId, { slug: `leap-${suffix}`, startsOn: '2028-02-29', endsOn: null })
		).toMatchObject({ ok: true });
	});

	it('rejects an end date before the start date', async () => {
		const result = await create(ownerId, {
			slug: `backwards-${suffix}`,
			startsOn: '2028-05-14',
			endsOn: '2028-05-12'
		});
		expect(result).toMatchObject({ ok: false, reason: 'invalid', field: 'endsOn' });
	});

	it('allows a conference with no dates at all', async () => {
		// Both are nullable in the schema, and an organizer who has not fixed the
		// dates yet still needs somewhere to collect submissions.
		const result = await create(ownerId, {
			slug: `undated-${suffix}`,
			startsOn: null,
			endsOn: null
		});
		expect(result.ok).toBe(true);
	});
});

describe('organizationForNewConference', () => {
	it('names the organization for an owner and nothing for a plain member', async () => {
		expect(await organizationForNewConference(ownerId)).toBe(orgId);
		expect(await organizationForNewConference(plainMemberId)).toBeNull();
		expect(await organizationForNewConference(outsiderId)).toBeNull();
	});
});

describe('slugify', () => {
	it('turns a conference name into an address', () => {
		expect(slugify('DevFlow Conf 2027')).toBe('devflow-conf-2027');
		expect(slugify('  Ünicode & Symbols!  ')).toBe('nicode-symbols');
	});

	it('never leaves a trailing hyphen, including after the length cut', () => {
		// The slice can land on a hyphen, and `…-2027-` fails the pattern the
		// server enforces — so the suggestion would be rejected the moment it was
		// submitted unedited.
		const long = `${'a'.repeat(59)} tail`;
		expect(slugify(long).endsWith('-')).toBe(false);
	});
});
