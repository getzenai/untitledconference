/**
 * A conditional accept is an accept with a note (#445), and the note can
 * be rewritten later without taking the accept back (#540).
 *
 * The interesting failures are the ones that would invent a second status:
 * a note whose owner cannot chase it, a resolve that quietly un-accepts the
 * talk, a rewrite that costs a slot or a speaker confirmation, and a
 * neighbour conference's submission answering as if it were ours.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	conferenceOrganizers,
	isConferenceOrganizer,
	openAcceptConditions,
	parseAcceptCondition,
	resolveAcceptCondition,
	updateAcceptCondition
} from './accept-condition';

const suffix = `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const OWNER = `owner-${suffix}`;
const FOLLOW = `follow-${suffix}`;
const OTHER = `other-${suffix}`;
const PEOPLE = [OWNER, FOLLOW, OTHER];

let conference: Conference;
let neighbour: Conference;
let submissionId: number;
let neighbourId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Condition Org',
		slug: organizationId,
		createdAt: new Date()
	});

	for (const id of PEOPLE) {
		await db.insert(user).values({
			id,
			name: id === OWNER ? 'Ann Follows' : id === FOLLOW ? 'Bob Chases' : 'Stranger',
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();
	[neighbour] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-n` })
		.returning();

	await db.insert(member).values(
		[OWNER, FOLLOW].map((userId) => ({
			id: `m-${userId}`,
			organizationId,
			userId,
			role: 'owner' as const,
			createdAt: new Date()
		}))
	);
});

beforeEach(async () => {
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, neighbour.id));

	const [ours] = await db
		.insert(submissionTable)
		.values({
			conferenceId: conference.id,
			title: 'Bring a co-presenter',
			status: 'accepted',
			acceptCondition: 'bring someone from the business side',
			acceptConditionOwnerId: OWNER
		})
		.returning();
	submissionId = ours.id;

	const [theirs] = await db
		.insert(submissionTable)
		.values({
			conferenceId: neighbour.id,
			title: 'Not yours',
			status: 'accepted',
			acceptCondition: 'foreign note',
			acceptConditionOwnerId: OWNER
		})
		.returning();
	neighbourId = theirs.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(inArray(user.id, PEOPLE));
});

describe('parseAcceptCondition', () => {
	it('reads empty fields as a clean accept', () => {
		const form = new FormData();
		form.set('condition', '  ');
		form.set('conditionOwnerId', '');
		expect(parseAcceptCondition(form)).toEqual({ ok: true, condition: null });
	});

	it('refuses a note without an owner, and an owner without a note', () => {
		const noteOnly = new FormData();
		noteOnly.set('condition', 'bring a co-presenter');
		expect(parseAcceptCondition(noteOnly)).toMatchObject({ ok: false });

		const ownerOnly = new FormData();
		ownerOnly.set('conditionOwnerId', OWNER);
		expect(parseAcceptCondition(ownerOnly)).toMatchObject({ ok: false });
	});

	it('keeps the sentence the committee typed', () => {
		const form = new FormData();
		form.set('condition', '  bring a co-presenter  ');
		form.set('conditionOwnerId', OWNER);
		expect(parseAcceptCondition(form)).toEqual({
			ok: true,
			condition: { text: 'bring a co-presenter', ownerId: OWNER }
		});
	});
});

describe('conference organizers', () => {
	it('lists the org owners and refuses a stranger', async () => {
		const owners = await conferenceOrganizers(conference);
		expect(owners).toEqual([
			{ userId: OWNER, name: 'Ann Follows' },
			{ userId: FOLLOW, name: 'Bob Chases' }
		]);
		expect(await isConferenceOrganizer(conference, OWNER)).toBe(true);
		expect(await isConferenceOrganizer(conference, FOLLOW)).toBe(true);
		expect(await isConferenceOrganizer(conference, OTHER)).toBe(false);
	});
});

describe('openAcceptConditions', () => {
	it('names the note on this conference and skips the neighbour', async () => {
		const open = await openAcceptConditions(conference.id);
		expect(open).toEqual([
			{
				submissionId,
				title: 'Bring a co-presenter',
				condition: 'bring someone from the business side',
				ownerId: OWNER,
				ownerName: 'Ann Follows'
			}
		]);
		expect(open.map((row) => row.submissionId)).not.toContain(neighbourId);
	});

	it('drops a resolved note from the board', async () => {
		await resolveAcceptCondition(conference.id, submissionId);
		expect(await openAcceptConditions(conference.id)).toEqual([]);
	});
});

describe('resolveAcceptCondition', () => {
	it('clears the note and leaves the talk accepted', async () => {
		const result = await resolveAcceptCondition(conference.id, submissionId);
		expect(result).toEqual({ ok: true, changed: true });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('accepted');
		expect(row.acceptCondition).toBeNull();
		expect(row.acceptConditionOwnerId).toBeNull();
	});

	it('does not resolve a neighbour conference’s note', async () => {
		expect(await resolveAcceptCondition(conference.id, neighbourId)).toEqual({
			ok: false,
			reason: 'not_found'
		});

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, neighbourId));
		expect(row.acceptCondition).toBe('foreign note');
	});
});

describe('updateAcceptCondition', () => {
	it('rewrites the sentence and the owner, and leaves status, slot, tasks and confirmation alone', async () => {
		const [{ id: speakerProfileId }] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId,
				name: 'Ada Speaker',
				sortName: 'Speaker, Ada'
			})
			.returning({ id: speakerProfileTable.id });

		const [placement] = await db
			.insert(placementTable)
			.values({
				conferenceId: conference.id,
				submissionId,
				status: 'tentative'
			})
			.returning();
		const [seat] = await db
			.insert(conferenceSpeakerTable)
			.values({
				conferenceId: conference.id,
				speakerProfileId,
				status: 'confirmed'
			})
			.returning();
		const [task] = await db
			.insert(taskTable)
			.values({
				conferenceId: conference.id,
				speakerProfileId,
				submissionId,
				title: 'Upload slides',
				status: 'open'
			})
			.returning();

		const result = await updateAcceptCondition(conference, submissionId, {
			text: 'bring two people from the business side',
			ownerId: FOLLOW
		});
		expect(result).toEqual({ ok: true });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('accepted');
		expect(row.acceptCondition).toBe('bring two people from the business side');
		expect(row.acceptConditionOwnerId).toBe(FOLLOW);

		const [samePlacement] = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.id, placement.id));
		expect(samePlacement.status).toBe(placement.status);
		expect(samePlacement.submissionId).toBe(submissionId);

		const [sameSeat] = await db
			.select()
			.from(conferenceSpeakerTable)
			.where(eq(conferenceSpeakerTable.id, seat.id));
		expect(sameSeat.status).toBe('confirmed');

		const [sameTask] = await db.select().from(taskTable).where(eq(taskTable.id, task.id));
		expect(sameTask.status).toBe('open');
		expect(sameTask.title).toBe('Upload slides');

		const open = await openAcceptConditions(conference.id);
		expect(open).toEqual([
			{
				submissionId,
				title: 'Bring a co-presenter',
				condition: 'bring two people from the business side',
				ownerId: FOLLOW,
				ownerName: 'Bob Chases'
			}
		]);
	});

	it('refuses a talk that is not accepted, a clean accept, and a stranger as owner', async () => {
		await db
			.update(submissionTable)
			.set({ status: 'submitted' })
			.where(eq(submissionTable.id, submissionId));
		expect(
			await updateAcceptCondition(conference, submissionId, {
				text: 'too late',
				ownerId: OWNER
			})
		).toEqual({ ok: false, reason: 'not_accepted' });

		await db
			.update(submissionTable)
			.set({ status: 'accepted', acceptCondition: null, acceptConditionOwnerId: null })
			.where(eq(submissionTable.id, submissionId));
		expect(
			await updateAcceptCondition(conference, submissionId, {
				text: 'forgotten note',
				ownerId: OWNER
			})
		).toEqual({ ok: false, reason: 'no_condition' });

		await db
			.update(submissionTable)
			.set({
				acceptCondition: 'bring someone from the business side',
				acceptConditionOwnerId: OWNER
			})
			.where(eq(submissionTable.id, submissionId));
		expect(
			await updateAcceptCondition(conference, submissionId, {
				text: 'bring someone from the business side',
				ownerId: OTHER
			})
		).toEqual({ ok: false, reason: 'invalid_owner' });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.acceptCondition).toBe('bring someone from the business side');
		expect(row.acceptConditionOwnerId).toBe(OWNER);
	});

	it('does not rewrite a neighbour conference’s note', async () => {
		expect(
			await updateAcceptCondition(conference, neighbourId, {
				text: 'stolen',
				ownerId: OWNER
			})
		).toEqual({ ok: false, reason: 'not_found' });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, neighbourId));
		expect(row.acceptCondition).toBe('foreign note');
	});
});
