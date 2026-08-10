/**
 * The `?/visibility` action, measured where it actually matters.
 *
 * Asserting that a column now says 'published' would prove almost nothing: the
 * bug was never that the value was wrong, it was that nothing in the app could
 * ever write it, and the cost was paid three routes away — the public site, the
 * front-door directory and the public call for papers all filter on it. So each
 * test here reads the *consumers* before and after, through their own loaders,
 * rather than reading back the row the action just wrote.
 */
import { openCall } from '$lib/server/conference/cfp-submission';
import {
	listPublishedConferences,
	loadPublicConference
} from '$lib/server/conference/public-conference';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `visibility-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const slug = `conf-${suffix}`;

function visibilityEvent(published: boolean) {
	const body = new FormData();
	body.append('published', published ? 'true' : 'false');

	return {
		request: new Request(`http://localhost/manage/${slug}/settings?/visibility`, {
			method: 'POST',
			body
		}),
		params: { slug },
		locals: { user: { id: organizerId } }
	} as unknown as Parameters<typeof actions.visibility>[0];
}

const storedStatus = async () => {
	const [row] = await db
		.select({ status: conferenceTable.status })
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, slug));
	return row.status;
};

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Visibility Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: organizerId,
		email: `${organizerId}@example.test`,
		emailVerified: true,
		name: 'An Organizer'
	});

	// requireOrganizer resolves the right from an org-wide seat; without it every
	// call below would 404 and the test would pass for the wrong reason.
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	// No status: exactly what `/manage/new` writes, which is the state every
	// organizer-made conference was stuck in.
	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Visibility Conf',
			slug,
			startsOn: '2028-05-12',
			endsOn: '2028-05-12'
		})
		.returning();

	// A published call, so the only thing standing between a speaker and the form
	// is the conference's own status.
	await db.insert(cfpFormTable).values({
		conferenceId: conference.id,
		title: 'Call for papers',
		status: 'published'
	});
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.slug, slug));
	await db.delete(member).where(eq(member.userId, organizerId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('?/visibility', () => {
	it('starts invisible — the state a conference created in the product is born in', async () => {
		expect(await storedStatus()).toBe('draft');
		expect(await loadPublicConference(slug)).toBeNull();
		expect(await openCall(slug)).toBeNull();
		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(false);
	});

	it('publishing opens the public site, the directory and the call together', async () => {
		await actions.visibility(visibilityEvent(true));

		expect(await storedStatus()).toBe('published');

		const site = await loadPublicConference(slug);
		expect(site?.slug).toBe(slug);

		// The CFP filter is a second, independent `status = 'published'` check. A fix
		// that only reached the public site would leave speakers locked out.
		expect((await openCall(slug))?.conference.slug).toBe(slug);

		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(true);
	});

	it('goes back to draft and takes all three away again', async () => {
		await actions.visibility(visibilityEvent(false));

		expect(await storedStatus()).toBe('draft');
		expect(await loadPublicConference(slug)).toBeNull();
		expect(await openCall(slug)).toBeNull();
		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(false);
	});

	/**
	 * The form posts the state it wants, so re-posting the state a conference is
	 * already in has to be a no-op rather than a flip — that is the whole reason it
	 * is not a "toggle" button.
	 */
	it('is idempotent when the wanted state is the current one', async () => {
		await actions.visibility(visibilityEvent(false));
		expect(await storedStatus()).toBe('draft');

		await actions.visibility(visibilityEvent(true));
		await actions.visibility(visibilityEvent(true));
		expect(await storedStatus()).toBe('published');
	});
});
