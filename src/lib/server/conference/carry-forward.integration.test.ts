/**
 * The invite lane against a real database.
 *
 * Three promises a typecheck cannot catch: only rejected talks from the
 * named predecessor appear; invite and discard survive a second read; a
 * submission from somewhere else is not_found, not silently written.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	carryForwardTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { carryForwardLane, setCarryForwardDisposition } from './carry-forward';
import { setConferencePredecessor } from './predecessor';

const suffix = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const reviewerId = `rev-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Carry Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: reviewerId,
		name: 'Riley Reviewer',
		email: `${reviewerId}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(user).where(eq(user.id, reviewerId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

async function conference(name: string) {
	const [row] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name,
			slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}-${Math.random().toString(36).slice(2, 6)}`
		})
		.returning();
	return row;
}

async function talk(
	conferenceId: number,
	title: string,
	status: 'rejected' | 'accepted' | 'submitted' = 'rejected'
) {
	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId, title, status })
		.returning();
	return row;
}

async function speaker(name: string) {
	const [row] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name,
			sortName: name,
			email: `${name.toLowerCase().replace(/\s+/g, '.')}@${suffix}.example`
		})
		.returning();
	return row;
}

async function scoreTalk(
	predecessorId: number,
	submissionId: number,
	value: string,
	comment: string
) {
	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId: predecessorId, name: `Plan ${submissionId}` })
		.returning();
	const [round] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Round 1', position: 0 })
		.returning();
	const [criterion] = await db
		.insert(scorecardCriterionTable)
		.values({ reviewRoundId: round.id, label: 'Relevance', kind: 'rating', scaleMax: 5 })
		.returning();
	const [review] = await db
		.insert(reviewTable)
		.values({
			reviewRoundId: round.id,
			submissionId,
			reviewerUserId: reviewerId,
			status: 'submitted',
			comment,
			submittedAt: new Date()
		})
		.returning();
	await db.insert(reviewScoreTable).values({
		reviewId: review.id,
		scorecardCriterionId: criterion.id,
		valueNumber: value
	});
}

describe('carryForwardLane', () => {
	it('is empty and nameless when no predecessor is set', async () => {
		const current = await conference('No Pointer');

		expect(await carryForwardLane(current.id)).toEqual({ predecessor: null, rows: [] });
	});

	it('lists only the predecessor’s rejected talks, highest score first, with comments', async () => {
		const previous = await conference('DevFlow 2027');
		const current = await conference('DevFlow 2028');
		await setConferencePredecessor(current.id, previous.id);

		const low = await talk(previous.id, 'A fine talk that did not fit');
		const high = await talk(previous.id, 'The near miss');
		const accepted = await talk(previous.id, 'Already in', 'accepted');
		const elsewhere = await talk(current.id, 'This year’s draft', 'submitted');
		const speakerRow = await speaker('Ada Speaker');
		await db.insert(submissionSpeakerTable).values({
			submissionId: high.id,
			speakerProfileId: speakerRow.id,
			isPrimary: true,
			position: 0
		});
		await scoreTalk(previous.id, high.id, '5', 'Strong, bring them back.');
		await scoreTalk(previous.id, low.id, '3', 'Fine, not a priority.');

		const lane = await carryForwardLane(current.id);

		expect(lane.predecessor).toEqual({
			id: previous.id,
			name: previous.name,
			slug: previous.slug
		});
		expect(lane.rows.map((row) => row.submissionId)).toEqual([high.id, low.id]);
		expect(lane.rows.map((row) => row.submissionId)).not.toContain(accepted.id);
		expect(lane.rows.map((row) => row.submissionId)).not.toContain(elsewhere.id);
		expect(lane.rows[0]).toMatchObject({
			title: 'The near miss',
			speakers: [{ id: speakerRow.id, name: 'Ada Speaker' }],
			comments: ['Strong, bring them back.'],
			disposition: null
		});
		expect(lane.rows[0].score).toBeCloseTo(5, 5);
		expect(lane.rows[1].score).toBeCloseTo(3, 5);
	});
});

describe('setCarryForwardDisposition', () => {
	it('writes invite and discard so a second load still sees them', async () => {
		const previous = await conference('Persist 2027');
		const current = await conference('Persist 2028');
		await setConferencePredecessor(current.id, previous.id);
		const declined = await talk(previous.id, 'Worth another look');
		const speakerRow = await speaker('Sam Speaker');
		await db.insert(submissionSpeakerTable).values({
			submissionId: declined.id,
			speakerProfileId: speakerRow.id,
			isPrimary: true,
			position: 0
		});

		expect(await setCarryForwardDisposition(current.id, declined.id, 'invited')).toEqual({
			ok: true,
			disposition: 'invited'
		});

		const invited = await carryForwardLane(current.id);
		expect(invited.rows).toEqual([
			expect.objectContaining({
				submissionId: declined.id,
				disposition: 'invited'
			})
		]);

		const [roster] = await db
			.select({
				status: conferenceSpeakerTable.status,
				speakerProfileId: conferenceSpeakerTable.speakerProfileId
			})
			.from(conferenceSpeakerTable)
			.where(
				and(
					eq(conferenceSpeakerTable.conferenceId, current.id),
					eq(conferenceSpeakerTable.speakerProfileId, speakerRow.id)
				)
			);
		expect(roster).toEqual({ status: 'invited', speakerProfileId: speakerRow.id });

		expect(await setCarryForwardDisposition(current.id, declined.id, 'discarded')).toEqual({
			ok: true,
			disposition: 'discarded'
		});
		expect((await carryForwardLane(current.id)).rows[0].disposition).toBe('discarded');
	});

	it('refuses a write when no predecessor is named', async () => {
		const current = await conference('Orphan');
		const declined = await talk(current.id, 'Nowhere to carry');

		expect(await setCarryForwardDisposition(current.id, declined.id, 'invited')).toEqual({
			ok: false,
			reason: 'no_predecessor'
		});
		expect(
			await db
				.select({ id: carryForwardTable.id })
				.from(carryForwardTable)
				.where(eq(carryForwardTable.conferenceId, current.id))
		).toEqual([]);
	});

	it('does not write a talk that is not a rejected predecessor submission', async () => {
		const previous = await conference('Strict 2027');
		const current = await conference('Strict 2028');
		const other = await conference('Unrelated');
		await setConferencePredecessor(current.id, previous.id);
		const accepted = await talk(previous.id, 'Already in', 'accepted');
		const foreign = await talk(other.id, 'Someone else’s reject');

		expect(await setCarryForwardDisposition(current.id, accepted.id, 'invited')).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(await setCarryForwardDisposition(current.id, foreign.id, 'discarded')).toEqual({
			ok: false,
			reason: 'not_found'
		});
	});

	it('does not double a speaker who is already on this edition’s roster', async () => {
		const previous = await conference('Dup 2027');
		const current = await conference('Dup 2028');
		await setConferencePredecessor(current.id, previous.id);
		const declined = await talk(previous.id, 'Seen them');
		const speakerRow = await speaker('Already Here');
		await db.insert(submissionSpeakerTable).values({
			submissionId: declined.id,
			speakerProfileId: speakerRow.id,
			isPrimary: true,
			position: 0
		});
		await db.insert(conferenceSpeakerTable).values({
			conferenceId: current.id,
			speakerProfileId: speakerRow.id,
			status: 'confirmed'
		});

		expect(await setCarryForwardDisposition(current.id, declined.id, 'invited')).toEqual({
			ok: true,
			disposition: 'invited'
		});

		const roster = await db
			.select({
				id: conferenceSpeakerTable.id,
				status: conferenceSpeakerTable.status
			})
			.from(conferenceSpeakerTable)
			.where(
				and(
					eq(conferenceSpeakerTable.conferenceId, current.id),
					eq(conferenceSpeakerTable.speakerProfileId, speakerRow.id)
				)
			);
		expect(roster).toEqual([{ id: roster[0].id, status: 'confirmed' }]);
	});
});
