/**
 * An editorial stand is a name on an accept (#446).
 *
 * The interesting failures are the ones that would invent a second status:
 * writing a stand on a talk that is not accepted, advancing a neighbour
 * conference's talk, and a write that quietly un-accepts the talk.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	advanceEditorialStand,
	hangingEditorialStands,
	setEditorialStand
} from './editorial-stand';

const suffix = `ed446-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const OWNER = `owner-${suffix}`;

let conference: Conference;
let neighbour: Conference;
let submissionId: number;
let neighbourId: number;
let cleanId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Editorial Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: OWNER,
		name: 'Ann Follows',
		email: `${OWNER}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();
	[neighbour] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-n` })
		.returning();
});

beforeEach(async () => {
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, neighbour.id));

	const [ours] = await db
		.insert(submissionTable)
		.values({
			conferenceId: conference.id,
			title: 'The deck we have not seen',
			status: 'accepted',
			acceptCondition: 'bring someone from the business side',
			acceptConditionOwnerId: OWNER,
			editorialStand: 'materials_requested'
		})
		.returning();
	submissionId = ours.id;

	const [clean] = await db
		.insert(submissionTable)
		.values({
			conferenceId: conference.id,
			title: 'A clean accept',
			status: 'accepted'
		})
		.returning();
	cleanId = clean.id;

	const [theirs] = await db
		.insert(submissionTable)
		.values({
			conferenceId: neighbour.id,
			title: 'Not yours',
			status: 'accepted',
			editorialStand: 'received'
		})
		.returning();
	neighbourId = theirs.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(inArray(user.id, [OWNER]));
});

describe('hangingEditorialStands', () => {
	it('names the hanging talks on this conference and skips the neighbour', async () => {
		const hanging = await hangingEditorialStands(conference.id);
		expect(hanging).toEqual([
			{
				submissionId,
				title: 'The deck we have not seen',
				stand: 'materials_requested'
			}
		]);
		expect(hanging.map((row) => row.submissionId)).not.toContain(neighbourId);
		expect(hanging.map((row) => row.submissionId)).not.toContain(cleanId);
	});

	it('drops a talk that reaches final', async () => {
		await setEditorialStand(conference.id, submissionId, 'final');
		expect(await hangingEditorialStands(conference.id)).toEqual([]);
	});
});

describe('setEditorialStand', () => {
	it('names the stand and leaves the accept, the condition and the owner alone', async () => {
		const result = await setEditorialStand(conference.id, submissionId, 'received');
		expect(result).toEqual({ ok: true, stand: 'received' });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('accepted');
		expect(row.editorialStand).toBe('received');
		expect(row.acceptCondition).toBe('bring someone from the business side');
		expect(row.acceptConditionOwnerId).toBe(OWNER);
	});

	it('refuses a talk that is not accepted', async () => {
		await db
			.update(submissionTable)
			.set({ status: 'submitted', editorialStand: null })
			.where(eq(submissionTable.id, cleanId));

		expect(await setEditorialStand(conference.id, cleanId, 'received')).toEqual({
			ok: false,
			reason: 'not_accepted'
		});

		const [row] = await db.select().from(submissionTable).where(eq(submissionTable.id, cleanId));
		expect(row.status).toBe('submitted');
		expect(row.editorialStand).toBeNull();
	});

	it('does not write a neighbour conference’s talk', async () => {
		expect(await setEditorialStand(conference.id, neighbourId, 'reviewed')).toEqual({
			ok: false,
			reason: 'not_found'
		});

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, neighbourId));
		expect(row.editorialStand).toBe('received');
	});
});

describe('advanceEditorialStand', () => {
	it('moves one named step and starts an unset talk at materials requested', async () => {
		expect(await advanceEditorialStand(conference.id, submissionId)).toEqual({
			ok: true,
			stand: 'received'
		});
		expect(await advanceEditorialStand(conference.id, cleanId)).toEqual({
			ok: true,
			stand: 'materials_requested'
		});
	});

	it('refuses to walk past final', async () => {
		await setEditorialStand(conference.id, submissionId, 'final');
		expect(await advanceEditorialStand(conference.id, submissionId)).toEqual({
			ok: false,
			reason: 'already_final'
		});

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('accepted');
		expect(row.editorialStand).toBe('final');
	});
});
