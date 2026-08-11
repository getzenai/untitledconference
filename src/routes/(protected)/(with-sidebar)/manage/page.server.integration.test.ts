/**
 * "My conferences" must render, not redirect.
 *
 * The page shortcut into the single conference was the reason the create entry
 * point vanished for anyone who already had one. A component test cannot see
 * that: the redirect lives in the load, so removing the button and removing the
 * shortcut are two different regressions and need two different tests.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load } from './+page.server';

const suffix = `manage-load-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerId = `owner-${suffix}`;
const orgId = `org-${suffix}`;
let conferenceId = 0;

/** The load only reads `locals.user.id`; the rest of the event is not its business. */
function eventFor(userId: string) {
	return { locals: { user: { id: userId } } } as unknown as Parameters<typeof load>[0];
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: orgId, name: 'Load Org', slug: orgId, createdAt: new Date() });
	await db
		.insert(user)
		.values({ id: ownerId, email: `${ownerId}@example.test`, emailVerified: true, name: 'Owner' });
	await db.insert(member).values({
		id: `seat-${suffix}`,
		organizationId: orgId,
		userId: ownerId,
		role: 'owner',
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId: orgId, name: 'Only One', slug: `only-one-${suffix}` })
		.returning();
	conferenceId = conference.id;
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(member).where(eq(member.userId, ownerId));
	await db.delete(organization).where(eq(organization.id, orgId));
	await db.delete(user).where(eq(user.id, ownerId));
});

describe('the my-conferences load', () => {
	it('renders the list for an owner with exactly one conference', async () => {
		// The state that used to redirect. `load` signals a redirect by throwing,
		// so simply returning is the assertion — and `canCreate` has to survive to
		// the page, since it is what puts the button there.
		const data = await load(eventFor(ownerId));

		// A load that redirects throws before returning, and one that returns
		// nothing has no data for the page. Both are the failure this test is
		// about, so say so rather than letting the next line report `undefined`.
		if (!data) throw new Error('the load produced no data for the page');

		expect(data.conferences).toHaveLength(1);
		expect(data.conferences[0].slug).toBe(`only-one-${suffix}`);
		expect(data.canCreate).toBe(true);
	});
});
