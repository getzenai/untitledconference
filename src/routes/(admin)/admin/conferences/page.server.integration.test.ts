/**
 * The platform admin's one-way valve on the front page (#426).
 *
 * Three things are worth a database rather than a mock: that unlisting really
 * clears the column the directory filters on, that it leaves `status` alone —
 * taking a conference off the front page must not close its call for papers —
 * and that a caller without the admin flag gets nothing done. The last one is
 * not theatre: the layout guard is a `load`, and a `load` does not run in front
 * of a POST to a sibling action.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const suffix = `admin-listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Front Page Org',
		slug: organizationId,
		createdAt: new Date()
	});
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

async function seedConference(
	status: 'draft' | 'published' | 'archived',
	listedPublicly: boolean
): Promise<{ id: number; slug: string }> {
	const slug = `conf-${Math.random().toString(36).slice(2, 10)}`;
	const [row] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: `Conf ${slug}`, slug, status, listedPublicly })
		.returning({ id: conferenceTable.id, slug: conferenceTable.slug });
	return row;
}

function unlistEvent(conferenceId: number | string, isAdmin = true) {
	const body = new FormData();
	body.append('conferenceId', String(conferenceId));

	return {
		request: new Request('http://localhost/admin/conferences?/unlist', { method: 'POST', body }),
		locals: { isAdmin, user: { id: `admin-${suffix}`, email: `admin-${suffix}@example.test` } }
	} as unknown as Parameters<typeof actions.unlist>[0];
}

async function rowOf(id: number) {
	const [row] = await db
		.select({ status: conferenceTable.status, listed: conferenceTable.listedPublicly })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, id));
	return row;
}

describe('the admin front-page listing surface', () => {
	it('lists what is listed, and nothing else', async () => {
		const listed = await seedConference('published', true);
		const unlisted = await seedConference('published', false);

		const { conferences } = (await load({} as Parameters<typeof load>[0])) as {
			conferences: { slug: string }[];
		};
		const slugs = conferences.map((c) => c.slug);

		expect(slugs).toContain(listed.slug);
		expect(slugs).not.toContain(unlisted.slug);
	});

	it('takes a conference off the front page without unpublishing it', async () => {
		const conference = await seedConference('published', true);

		const result = await actions.unlist(unlistEvent(conference.id));

		expect(result).toMatchObject({ success: true });
		const row = await rowOf(conference.id);
		expect(row.listed).toBe(false);
		// The whole point of the separate column: `/c/<slug>` and its CFP survive.
		expect(row.status).toBe('published');
	});

	it('says so plainly when there was nothing to take down', async () => {
		const conference = await seedConference('published', false);

		const result = await actions.unlist(unlistEvent(conference.id));

		expect(result).toMatchObject({ success: true });
		expect((result as { message: string }).message).toMatch(/already/);
	});

	it('refuses a caller without the admin flag, and changes nothing', async () => {
		const conference = await seedConference('published', true);

		const result = await actions.unlist(unlistEvent(conference.id, false));

		expect(result).toMatchObject({ status: 403 });
		expect((await rowOf(conference.id)).listed).toBe(true);
	});

	it('refuses an id that is not one', async () => {
		const result = await actions.unlist(unlistEvent('not-a-number'));
		expect(result).toMatchObject({ status: 400 });
	});

	it('refuses an id nobody owns', async () => {
		const result = await actions.unlist(unlistEvent(2_000_000_000));
		expect(result).toMatchObject({ status: 404 });
	});
});
