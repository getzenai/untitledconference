/**
 * The edition pointer against a real database.
 *
 * Two promises from #448 that a typecheck cannot catch: a conference does not
 * name itself, and walking the chain never returns to the start. Setting and
 * clearing are the happy path those two sit on.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setConferencePredecessor } from './predecessor';

const suffix = `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const otherOrgId = `org-other-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: organizationId, name: 'Edition Org', slug: organizationId, createdAt: new Date() },
		{ id: otherOrgId, name: 'Other Org', slug: otherOrgId, createdAt: new Date() }
	]);
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, otherOrgId));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(organization).where(eq(organization.id, otherOrgId));
});

async function conference(orgId: string, name: string) {
	const [row] = await db
		.insert(conferenceTable)
		.values({
			organizationId: orgId,
			name,
			slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}-${Math.random().toString(36).slice(2, 6)}`
		})
		.returning();
	return row;
}

async function storedPredecessor(id: number) {
	const [row] = await db
		.select({ predecessorConferenceId: conferenceTable.predecessorConferenceId })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, id));
	return row.predecessorConferenceId;
}

describe('setConferencePredecessor', () => {
	it('writes the pointer and clears it again', async () => {
		const previous = await conference(organizationId, 'DevFlow 2027');
		const current = await conference(organizationId, 'DevFlow 2028');

		expect(await setConferencePredecessor(current.id, previous.id)).toEqual({
			ok: true,
			predecessorId: previous.id
		});
		expect(await storedPredecessor(current.id)).toBe(previous.id);

		expect(await setConferencePredecessor(current.id, null)).toEqual({
			ok: true,
			predecessorId: null
		});
		expect(await storedPredecessor(current.id)).toBeNull();
	});

	it('refuses a conference that points at itself', async () => {
		const row = await conference(organizationId, 'Alone');

		expect(await setConferencePredecessor(row.id, row.id)).toEqual({
			ok: false,
			reason: 'self'
		});
		expect(await storedPredecessor(row.id)).toBeNull();
	});

	it('refuses a cycle', async () => {
		const first = await conference(organizationId, 'First');
		const second = await conference(organizationId, 'Second');

		expect(await setConferencePredecessor(second.id, first.id)).toEqual({
			ok: true,
			predecessorId: first.id
		});
		expect(await setConferencePredecessor(first.id, second.id)).toEqual({
			ok: false,
			reason: 'cycle'
		});
		expect(await storedPredecessor(first.id)).toBeNull();
	});

	it('does not name a conference from another organization', async () => {
		const ours = await conference(organizationId, 'Ours');
		const theirs = await conference(otherOrgId, 'Theirs');

		expect(await setConferencePredecessor(ours.id, theirs.id)).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(await storedPredecessor(ours.id)).toBeNull();
	});
});
