/**
 * Guards the front door.
 *
 * `/` used to redirect a visitor without a session to `/login`, from which no
 * public conference site was linked — so `/c/<slug>` was reachable only by
 * guessing the slug. Every EMB scenario begins at the base URL with no account,
 * which made this list the thing all five public surfaces hang off.
 *
 * Two properties are worth a test and neither would fail a typecheck: a draft
 * conference must not be listed (its link would 404, because `loadHeader` filters
 * on the same `published` predicate), and the order has to be soonest-first so the
 * conference a visitor most likely came for is not below the fold.
 *
 * The fixture is hermetic and every assertion is scoped to its own slugs — the
 * function is deliberately global, so anything else in the shared test database
 * shows up in the same result.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listDirectoryConferences, loadPublicConference } from './public-conference';

const suffix = `pubdir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const laterSlug = `later-${suffix}`;
const soonerSlug = `sooner-${suffix}`;
const draftSlug = `draft-${suffix}`;
const unlistedSlug = `unlisted-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Directory Org',
		slug: organizationId,
		createdAt: new Date()
	});

	// Inserted later-first on purpose: a function that returned insertion order
	// would pass an assertion written the other way round.
	await db.insert(conferenceTable).values([
		{
			organizationId,
			name: 'Later Conf',
			slug: laterSlug,
			venue: 'Hall B',
			startsOn: '2027-11-02',
			endsOn: '2027-11-03',
			status: 'published',
			listedPublicly: true
		},
		{
			organizationId,
			name: 'Sooner Conf',
			slug: soonerSlug,
			venue: 'Hall A',
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published',
			listedPublicly: true
		},
		{
			// Published and deliberately not advertised (#402): the case the front page
			// got wrong. Dated earliest of all four, so a dropped filter puts it at the
			// top rather than somewhere a positional assertion might miss it.
			organizationId,
			name: 'Unlisted Conf',
			slug: unlistedSlug,
			venue: 'Hall C',
			startsOn: '2027-01-02',
			endsOn: '2027-01-02',
			status: 'published',
			listedPublicly: false
		},
		{
			organizationId,
			name: 'Draft Conf',
			slug: draftSlug,
			startsOn: '2027-01-04',
			endsOn: '2027-01-04',
			status: 'draft'
		}
	]);
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('listDirectoryConferences', () => {
	it('omits a conference the organizer has not published', async () => {
		const slugs = (await listDirectoryConferences()).map((c) => c.slug);

		// The draft has the earliest date of the three, so it would be first if the
		// status filter were dropped — the failure is loud rather than positional.
		expect(slugs).not.toContain(draftSlug);
		expect(slugs).toContain(soonerSlug);
		expect(slugs).toContain(laterSlug);
	});

	it('omits a published conference nobody chose to advertise', async () => {
		const slugs = (await listDirectoryConferences()).map((c) => c.slug);

		expect(slugs).not.toContain(unlistedSlug);
	});

	it('lists the soonest conference first', async () => {
		const slugs = (await listDirectoryConferences()).map((c) => c.slug);

		expect(slugs.indexOf(soonerSlug)).toBeLessThan(slugs.indexOf(laterSlug));
	});

	it('leaves the unlisted conference reachable at its own address', async () => {
		// The whole point of the flag: unlisting is not unpublishing. Anyone holding
		// the link — a speaker, an attendee, the organizer's own newsletter — must
		// still land on the site.
		const page = await loadPublicConference(unlistedSlug);

		expect(page?.slug).toBe(unlistedSlug);
	});

	it('carries what a card needs to be recognised and nothing else', async () => {
		const row = (await listDirectoryConferences()).find((c) => c.slug === soonerSlug)!;

		expect(row).toEqual({
			slug: soonerSlug,
			name: 'Sooner Conf',
			venue: 'Hall A',
			startsOn: '2027-05-12',
			endsOn: '2027-05-12'
		});
	});
});
