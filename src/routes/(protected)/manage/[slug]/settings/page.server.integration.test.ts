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
	listDirectoryConferences,
	listPublishedConferences,
	loadPublicConference
} from '$lib/server/conference/public-conference';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, membershipTable } from '$lib/server/db/conference/conference-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `visibility-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
/** Holds a conference-scoped `organizer` seat and nothing org-wide — see `?/archive`. */
const scopedOrganizerId = `scoped-${suffix}`;
const slug = `conf-${suffix}`;
let conferenceId = 0;

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

function listingEvent(listed: boolean) {
	const body = new FormData();
	body.append('listed', listed ? 'true' : 'false');

	return {
		request: new Request(`http://localhost/manage/${slug}/settings?/listing`, {
			method: 'POST',
			body
		}),
		params: { slug },
		locals: { user: { id: organizerId } }
	} as unknown as Parameters<typeof actions.listing>[0];
}

function archiveEvent(confirmSlug: string, userId: string = organizerId) {
	const body = new FormData();
	body.append('confirmSlug', confirmSlug);

	return {
		request: new Request(`http://localhost/manage/${slug}/settings?/archive`, {
			method: 'POST',
			body
		}),
		params: { slug },
		locals: { user: { id: userId } }
	} as unknown as Parameters<typeof actions.archive>[0];
}

function restoreEvent(userId: string = organizerId) {
	return {
		params: { slug },
		locals: { user: { id: userId } }
	} as unknown as Parameters<typeof actions.restore>[0];
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

	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'An Organizer'
		},
		{
			id: scopedOrganizerId,
			email: `${scopedOrganizerId}@example.test`,
			emailVerified: true,
			name: 'A Scoped Organizer'
		}
	]);

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

	conferenceId = conference.id;

	// The right to work on this one event, and nothing org-wide. `requireOrganizer`
	// lets this seat onto the settings page; archiving is the line it must not cross.
	await db.insert(membershipTable).values({
		userId: scopedOrganizerId,
		role: 'organizer',
		scopeType: 'conference',
		scopeId: conference.id
	});

	// A published call, so the only thing standing between a speaker and the form
	// is the conference's own status.
	await db.insert(cfpFormTable).values({
		conferenceId: conference.id,
		title: 'Call for papers',
		status: 'published'
	});
});

afterAll(async () => {
	await db.delete(membershipTable).where(eq(membershipTable.scopeId, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.slug, slug));
	await db.delete(member).where(eq(member.userId, organizerId));
	await db.delete(user).where(inArray(user.id, [organizerId, scopedOrganizerId]));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('?/visibility', () => {
	it('starts invisible — the state a conference created in the product is born in', async () => {
		expect(await storedStatus()).toBe('draft');
		expect(await loadPublicConference(slug)).toBeNull();
		expect(await openCall(slug)).toBeNull();
		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(false);
	});

	it('publishing opens the public site and the call together', async () => {
		await actions.visibility(visibilityEvent(true));

		expect(await storedStatus()).toBe('published');

		const site = await loadPublicConference(slug);
		expect(site?.slug).toBe(slug);

		// The CFP filter is a second, independent `status = 'published'` check. A fix
		// that only reached the public site would leave speakers locked out.
		expect((await openCall(slug))?.conference.slug).toBe(slug);

		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(true);
	});

	/**
	 * Publishing does not advertise (#402). The front page used to follow `status`
	 * alone, which is how a fixture named after a Unix timestamp ended up one click
	 * from the hero. It now takes a second, separate decision.
	 */
	it('leaves the front page alone until someone asks for it', async () => {
		expect((await listDirectoryConferences()).some((c) => c.slug === slug)).toBe(false);

		await actions.listing(listingEvent(true));
		expect((await listDirectoryConferences()).some((c) => c.slug === slug)).toBe(true);

		// And off again, without taking the public site or the call with it.
		await actions.listing(listingEvent(false));
		expect((await listDirectoryConferences()).some((c) => c.slug === slug)).toBe(false);
		expect(await loadPublicConference(slug)).not.toBeNull();
		expect((await openCall(slug))?.conference.slug).toBe(slug);
	});

	it('refuses to advertise a draft, and leaves it unlisted', async () => {
		await actions.visibility(visibilityEvent(false));

		const result = await actions.listing(listingEvent(true));

		expect(result).toMatchObject({ section: 'visibility' });
		expect((await listDirectoryConferences()).some((c) => c.slug === slug)).toBe(false);

		await actions.visibility(visibilityEvent(true));
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

/**
 * Archiving over the web (#332). The conference is published when this block
 * starts, which is the case the safeguards are for.
 *
 * Same measurement as above: the point of archiving is what the *consumers*
 * stop returning, not what the column says.
 */
describe('?/archive and ?/restore', () => {
	it('refuses a published conference until the slug is typed back', async () => {
		const result = await actions.archive(archiveEvent(''));

		expect(result).toMatchObject({ status: 400 });
		expect(await storedStatus()).toBe('published');
		// The guard is worth nothing if the page went dark anyway.
		expect(await loadPublicConference(slug)).not.toBeNull();
	});

	it('refuses a slug that is nearly right', async () => {
		await actions.archive(archiveEvent(`${slug}-oops`));
		expect(await storedStatus()).toBe('published');
	});

	it('is not something a conference-scoped organizer may do', async () => {
		const result = await actions.archive(archiveEvent(slug, scopedOrganizerId));

		expect(result).toMatchObject({ status: 403 });
		expect(await storedStatus()).toBe('published');
	});

	it('takes the public site, the directory and the call away together', async () => {
		await actions.archive(archiveEvent(slug));

		expect(await storedStatus()).toBe('archived');
		expect(await loadPublicConference(slug)).toBeNull();
		expect(await openCall(slug)).toBeNull();
		expect((await listPublishedConferences()).some((c) => c.slug === slug)).toBe(false);
	});

	/**
	 * Publishing must not be a second door out of the archive: it would clear the
	 * status while leaving `statusBeforeArchive` set, and the next restore would
	 * read a stale answer.
	 */
	it('cannot be undone by publishing', async () => {
		await actions.visibility(visibilityEvent(true));
		expect(await storedStatus()).toBe('archived');
	});

	it('restores to where it came from, not to a safer state nobody asked for', async () => {
		const result = await actions.restore(restoreEvent());

		expect(result).toMatchObject({ section: 'visibility' });
		expect(await storedStatus()).toBe('published');
		expect((await loadPublicConference(slug))?.slug).toBe(slug);
		expect((await openCall(slug))?.conference.slug).toBe(slug);
	});

	it('lets a draft go without a confirmation, because nobody outside can tell', async () => {
		await actions.visibility(visibilityEvent(false));
		await actions.archive(archiveEvent(''));

		expect(await storedStatus()).toBe('archived');
	});

	it('brings a draft back as a draft', async () => {
		await actions.restore(restoreEvent());
		expect(await storedStatus()).toBe('draft');
	});

	it('is not something a conference-scoped organizer may restore either', async () => {
		await actions.archive(archiveEvent(''));
		const result = await actions.restore(restoreEvent(scopedOrganizerId));

		expect(result).toMatchObject({ status: 403 });
		expect(await storedStatus()).toBe('archived');
	});
});
