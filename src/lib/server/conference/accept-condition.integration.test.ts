/**
 * A conditional accept is an accept with a note (#445).
 *
 * The interesting failures are the ones that would invent a second status:
 * a note whose owner cannot chase it, a resolve that quietly un-accepts the
 * talk, and a neighbour conference's submission answering as if it were ours.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	conferenceOrganizers,
	isConferenceOrganizer,
	openAcceptConditions,
	parseAcceptCondition,
	resolveAcceptCondition
} from './accept-condition';

const suffix = `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const OWNER = `owner-${suffix}`;
const OTHER = `other-${suffix}`;
const PEOPLE = [OWNER, OTHER];

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
			name: id === OWNER ? 'Ann Follows' : 'Stranger',
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

	await db.insert(member).values({
		id: `m-${OWNER}`,
		organizationId,
		userId: OWNER,
		role: 'owner',
		createdAt: new Date()
	});
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
	it('lists the org owner and refuses a stranger', async () => {
		const owners = await conferenceOrganizers(conference);
		expect(owners).toEqual([{ userId: OWNER, name: 'Ann Follows' }]);
		expect(await isConferenceOrganizer(conference, OWNER)).toBe(true);
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
