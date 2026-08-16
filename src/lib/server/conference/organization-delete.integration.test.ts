/**
 * Deleting an organization is a decision and an act, and the interesting
 * question is what can happen between them (#777, #792).
 *
 * The refusals are easy to test and easy to get right. The one that matters is
 * the last case here: a conference created by somebody else while the delete is
 * being decided. Under check-then-act that conference is counted as absent and
 * then taken by the cascade — a talk, its submissions and its reviews gone
 * because two people clicked at the same second.
 */
import { db } from '$lib/server/db';
import { invitation, member, organization, session, user } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { closeTestDatabase, createTestDatabase } from '$lib/server/db/test-utils';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteEmptyOrganization } from './organization-delete';

const suffix = `orgdel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const OWNER = `owner-${suffix}`;
const OTHER = `other-${suffix}`;
const NAME = 'DevFlow Conf';

let organizationId: string;
let created = 0;

async function freshOrganization() {
	organizationId = `org-${suffix}-${created++}`;
	await db
		.insert(organization)
		.values({ id: organizationId, name: NAME, slug: organizationId, createdAt: new Date() });
	await db.insert(member).values({
		id: `m-${organizationId}`,
		organizationId,
		userId: OWNER,
		role: 'owner',
		createdAt: new Date()
	});
}

async function organizationExists() {
	const rows = await db.select().from(organization).where(eq(organization.id, organizationId));
	return rows.length === 1;
}

const asOwner = { userId: OWNER, typedName: NAME };
const RACE_CONNECTION = `organization-delete-race-${suffix}`;

beforeEach(async () => {
	for (const [id, name] of [
		[OWNER, 'Ann Owner'],
		[OTHER, 'Bob Member']
	]) {
		await db
			.insert(user)
			.values({
				id,
				name,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.onConflictDoNothing();
	}
	await freshOrganization();
});

afterAll(async () => {
	await closeTestDatabase(RACE_CONNECTION);
	await db.delete(user).where(eq(user.id, OWNER));
	await db.delete(user).where(eq(user.id, OTHER));
});

describe('deleteEmptyOrganization', () => {
	it('deletes an empty organization the owner named exactly', async () => {
		const verdict = await deleteEmptyOrganization({ organizationId, ...asOwner });

		expect(verdict).toEqual({ ok: true });
		expect(await organizationExists()).toBe(false);
	});

	/**
	 * The pointer, not just the row.
	 *
	 * `session.active_organization_id` has no foreign key, so the cascade leaves
	 * it naming a row that is gone. The browser case only proves this for the
	 * session doing the deleting; a second sign-in on another device has nobody
	 * to drop its cookie, and this is the half that covers it.
	 */
	it('clears the pointer of every session that named the organization', async () => {
		const sessions = ['here', 'elsewhere'].map((where) => ({
			id: `s-${where}-${organizationId}`,
			token: `t-${where}-${organizationId}`,
			userId: OWNER,
			activeOrganizationId: organizationId,
			expiresAt: new Date(Date.now() + 86_400_000),
			createdAt: new Date(),
			updatedAt: new Date()
		}));
		await db.insert(session).values(sessions);

		const verdict = await deleteEmptyOrganization({ organizationId, ...asOwner });
		expect(verdict).toEqual({ ok: true });

		const after = await db
			.select({ id: session.id, activeOrganizationId: session.activeOrganizationId })
			.from(session)
			.where(eq(session.userId, OWNER));
		expect(after).toHaveLength(2);
		for (const row of after) {
			expect(row.activeOrganizationId, row.id).toBeNull();
		}

		await db.delete(session).where(eq(session.userId, OWNER));
	});

	it('refuses a member who is not the owner, and leaves it standing', async () => {
		await db.insert(member).values({
			id: `m2-${organizationId}`,
			organizationId,
			userId: OTHER,
			role: 'member',
			createdAt: new Date()
		});

		const verdict = await deleteEmptyOrganization({
			organizationId,
			userId: OTHER,
			typedName: NAME
		});

		expect(verdict.ok).toBe(false);
		expect(await organizationExists()).toBe(true);
	});

	it('answers an organization that is not theirs the same way as one that is missing', async () => {
		const missing = await deleteEmptyOrganization({
			organizationId: `${organizationId}-nope`,
			...asOwner
		});
		const notMine = await deleteEmptyOrganization({
			organizationId,
			userId: OTHER,
			typedName: NAME
		});

		expect(missing.ok).toBe(false);
		expect(missing).toEqual(notMine);
	});

	it('refuses while a conference or a pending invitation is attached', async () => {
		const [conference] = await db
			.insert(conferenceTable)
			.values({ organizationId, name: 'DevFlow 2027', slug: `${organizationId}-c` })
			.returning();

		const blocked = await deleteEmptyOrganization({ organizationId, ...asOwner });
		expect(blocked.ok === false && blocked.reason).toContain('1 event');
		expect(await organizationExists()).toBe(true);

		await db.delete(conferenceTable).where(eq(conferenceTable.id, conference.id));
		await db.insert(invitation).values({
			id: `inv-${organizationId}`,
			organizationId,
			email: `invitee-${suffix}@example.com`,
			status: 'pending',
			inviterId: OWNER,
			expiresAt: new Date(Date.now() + 86_400_000)
		});

		const stillBlocked = await deleteEmptyOrganization({ organizationId, ...asOwner });
		expect(stillBlocked.ok === false && stillBlocked.reason).toContain('1 pending invitation');
		expect(await organizationExists()).toBe(true);
	});

	it('refuses a name that is nearly right', async () => {
		const verdict = await deleteEmptyOrganization({
			organizationId,
			userId: OWNER,
			typedName: NAME.toLowerCase()
		});

		expect(verdict.ok).toBe(false);
		expect(await organizationExists()).toBe(true);
	});

	/**
	 * The race, driven rather than described.
	 *
	 * A second connection opens a transaction and creates a conference, then
	 * holds it open. The delete starts while that is uncommitted, so a count
	 * taken before the lock sees zero. Committing the insert afterwards must
	 * make the delete refuse — the state it acts on is the state after the
	 * lock, not the state when the button was pressed.
	 *
	 * Remove the `.for('update')` and this fails by *deleting* the conference
	 * that was just committed, which is exactly the loss #792 describes.
	 */
	it('refuses a conference that appears while the delete is being decided', async () => {
		const other = createTestDatabase(RACE_CONNECTION);
		let commit: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			commit = resolve;
		});

		let inserted: () => void = () => {};
		const insertLanded = new Promise<void>((resolve) => {
			inserted = resolve;
		});

		const inserting = other.transaction(async (tx) => {
			await tx
				.insert(conferenceTable)
				.values({ organizationId, name: 'Slipped In', slug: `${organizationId}-race` });
			inserted();
			await held;
		});

		// The insert has to be in flight before the delete starts, or the two
		// never meet and the test proves nothing about the order.
		await insertLanded;
		const pending = Symbol('pending');
		const deleting = deleteEmptyOrganization({ organizationId, ...asOwner });

		// The proof needs the delete to be *waiting*, not merely slow: if it had
		// already finished here, the case would say nothing about ordering.
		const reached = await Promise.race([
			deleting.then(() => 'finished'),
			new Promise((resolve) => setTimeout(() => resolve(pending), 500))
		]);
		expect(reached, 'the delete must be blocked on the row lock').toBe(pending);

		commit();
		await inserting;

		const verdict = await deleting;
		expect(verdict.ok, 'the delete must see the conference that was committed').toBe(false);
		expect(verdict.ok === false && verdict.reason).toContain('1 event');
		expect(await organizationExists()).toBe(true);

		const survivors = await db
			.select()
			.from(conferenceTable)
			.where(eq(conferenceTable.organizationId, organizationId));
		expect(survivors).toHaveLength(1);
	});
});
