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
import { conferenceTable, membershipTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

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

/**
 * The write half of the predecessor boundary (#448).
 *
 * `withEditionLinks` already refuses to *name* a sibling the caller does not
 * organize. That is the read path. A crafted POST still has to be refused, and
 * it has to refuse as the inline `not_found` — not a 404 page — so a
 * predecessor that vanished between render and submit leaves the organizer on
 * the list with the same sentence a foreign org already gets.
 */
describe('?/predecessor', () => {
	const writeSuffix = `pred-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const writeOrg = `org-${writeSuffix}`;
	const scopedId = `scoped-${writeSuffix}`;
	let mineId = 0;
	let theirsId = 0;

	beforeAll(async () => {
		await db
			.insert(organization)
			.values({ id: writeOrg, name: 'Write Org', slug: writeOrg, createdAt: new Date() });
		await db.insert(user).values({
			id: scopedId,
			email: `${scopedId}@example.test`,
			emailVerified: true,
			name: 'Scoped'
		});
		await db.insert(member).values({
			id: `seat-${writeSuffix}`,
			organizationId: writeOrg,
			userId: scopedId,
			role: 'member',
			createdAt: new Date()
		});

		const [mine] = await db
			.insert(conferenceTable)
			.values({ organizationId: writeOrg, name: 'Mine', slug: `mine-${writeSuffix}` })
			.returning();
		const [theirs] = await db
			.insert(conferenceTable)
			.values({ organizationId: writeOrg, name: 'Theirs', slug: `theirs-${writeSuffix}` })
			.returning();
		mineId = mine.id;
		theirsId = theirs.id;

		await db.insert(membershipTable).values({
			userId: scopedId,
			role: 'organizer',
			scopeType: 'conference',
			scopeId: mineId
		});
	});

	afterAll(async () => {
		await db.delete(membershipTable).where(eq(membershipTable.userId, scopedId));
		await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, writeOrg));
		await db.delete(member).where(eq(member.userId, scopedId));
		await db.delete(organization).where(eq(organization.id, writeOrg));
		await db.delete(user).where(eq(user.id, scopedId));
	});

	function predecessorEvent(conferenceId: number, predecessorId: number) {
		const body = new FormData();
		body.append('conferenceId', String(conferenceId));
		body.append('predecessorId', String(predecessorId));

		return {
			request: new Request('http://localhost/manage?/predecessor', { method: 'POST', body }),
			locals: { user: { id: scopedId } }
		} as unknown as Parameters<typeof actions.predecessor>[0];
	}

	it('refuses a same-org edition the scoped organizer does not organize', async () => {
		const result = await actions.predecessor(predecessorEvent(mineId, theirsId));

		expect(result).toMatchObject({
			status: 400,
			data: {
				conferenceId: mineId,
				error: 'That conference is not an earlier edition you can name.'
			}
		});

		const [row] = await db
			.select({ predecessorConferenceId: conferenceTable.predecessorConferenceId })
			.from(conferenceTable)
			.where(eq(conferenceTable.id, mineId));
		expect(row.predecessorConferenceId).toBeNull();
	});
});
