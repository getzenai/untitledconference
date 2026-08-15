/**
 * Last year's declined talks, worked on this edition (#448).
 *
 * The predecessor pointer is the door. This module is the lane behind it:
 * the rejected pile from that edition, sorted by the score they already
 * earned, with the committee comments still attached, and two writes that
 * survive a reload. Invite also puts those speakers on this edition's
 * roster as `invited` — that is the invite list the product already has.
 */
import {
	isCarryForwardDisposition,
	type CarryForwardDisposition
} from '$lib/conference/carry-forward';
import { db } from '$lib/server/db';
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
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { scoreExpression } from './submission-sort';

export type { CarryForwardDisposition };

export type CarryForwardSpeaker = {
	id: number;
	name: string;
};

export type CarryForwardRow = {
	submissionId: number;
	title: string;
	speakers: CarryForwardSpeaker[];
	score: number | null;
	comments: string[];
	declineNote: string | null;
	disposition: CarryForwardDisposition | null;
};

export type CarryForwardLane = {
	predecessor: { id: number; name: string; slug: string } | null;
	rows: CarryForwardRow[];
};

export type CarryForwardWriteResult =
	| { ok: true; disposition: CarryForwardDisposition }
	| { ok: false; reason: 'no_predecessor' | 'not_found' };

/**
 * The working pile for this edition: every rejected talk on the named
 * predecessor, highest score first. Unscored rows sink rather than sorting
 * as zero — same rule as the submissions table.
 */
async function namedPredecessor(conferenceId: number) {
	const [conference] = await db
		.select({ predecessorConferenceId: conferenceTable.predecessorConferenceId })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, conferenceId))
		.limit(1);
	if (!conference?.predecessorConferenceId) return null;

	const [predecessor] = await db
		.select({
			id: conferenceTable.id,
			name: conferenceTable.name,
			slug: conferenceTable.slug
		})
		.from(conferenceTable)
		.where(eq(conferenceTable.id, conference.predecessorConferenceId))
		.limit(1);
	return predecessor ?? null;
}

export async function carryForwardLane(conferenceId: number): Promise<CarryForwardLane> {
	const predecessor = await namedPredecessor(conferenceId);
	if (!predecessor) return { predecessor: null, rows: [] };

	const score = scoreExpression(predecessor.id);
	const listed = await db
		.select({
			submissionId: submissionTable.id,
			title: submissionTable.title,
			declineNote: submissionTable.declineNote,
			score,
			disposition: carryForwardTable.disposition
		})
		.from(submissionTable)
		.leftJoin(
			carryForwardTable,
			and(
				eq(carryForwardTable.predecessorSubmissionId, submissionTable.id),
				eq(carryForwardTable.conferenceId, conferenceId)
			)
		)
		.where(
			and(eq(submissionTable.conferenceId, predecessor.id), eq(submissionTable.status, 'rejected'))
		)
		.orderBy(sql`${score} desc nulls last`, asc(submissionTable.id));

	const ids = listed.map((row) => row.submissionId);
	const [speakers, comments] = await Promise.all([
		speakersFor(ids),
		commentsFor(predecessor.id, ids)
	]);

	return {
		predecessor,
		rows: listed.map((row) => toRow(row, speakers, comments))
	};
}

function toRow(
	row: {
		submissionId: number;
		title: string;
		declineNote: string | null;
		score: number | null;
		disposition: string | null;
	},
	speakers: Map<number, CarryForwardSpeaker[]>,
	comments: Map<number, string[]>
): CarryForwardRow {
	return {
		submissionId: row.submissionId,
		title: row.title,
		speakers: speakers.get(row.submissionId) ?? [],
		score: row.score === null || row.score === undefined ? null : Number(row.score),
		comments: comments.get(row.submissionId) ?? [],
		declineNote: row.declineNote,
		disposition:
			row.disposition && isCarryForwardDisposition(row.disposition) ? row.disposition : null
	};
}

async function speakersFor(ids: number[]): Promise<Map<number, CarryForwardSpeaker[]>> {
	const grouped = new Map<number, CarryForwardSpeaker[]>();
	if (ids.length === 0) return grouped;

	const rows = await db
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			id: speakerProfileTable.id,
			name: speakerProfileTable.name
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, ids))
		.orderBy(asc(submissionSpeakerTable.position), asc(submissionSpeakerTable.id));

	for (const row of rows) {
		const list = grouped.get(row.submissionId) ?? [];
		list.push({ id: row.id, name: row.name });
		grouped.set(row.submissionId, list);
	}
	return grouped;
}

/**
 * Submitted review comments, in the order they were filed. Empty comments
 * are dropped — a submitted scorecard with nothing to say is not a comment
 * the organizer can work from.
 */
async function commentsFor(predecessorId: number, ids: number[]): Promise<Map<number, string[]>> {
	const grouped = new Map<number, string[]>();
	if (ids.length === 0) return grouped;

	const rows = await db
		.select({
			submissionId: reviewTable.submissionId,
			comment: reviewTable.comment
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				inArray(reviewTable.submissionId, ids),
				eq(reviewTable.status, 'submitted'),
				eq(evaluationPlanTable.conferenceId, predecessorId),
				isNotNull(reviewTable.comment),
				ne(reviewTable.comment, '')
			)
		)
		.orderBy(asc(reviewTable.submittedAt), asc(reviewTable.id));

	for (const row of rows) {
		const comment = row.comment?.trim();
		if (!comment) continue;
		const list = grouped.get(row.submissionId) ?? [];
		list.push(comment);
		grouped.set(row.submissionId, list);
	}
	return grouped;
}

/**
 * Invite or discard one declined talk from the predecessor. Invite also
 * seats that talk's speakers on this edition's roster; a speaker who is
 * already there is left alone rather than rewritten.
 */
export async function setCarryForwardDisposition(
	conferenceId: number,
	predecessorSubmissionId: number,
	disposition: CarryForwardDisposition
): Promise<CarryForwardWriteResult> {
	return db.transaction(async (tx) => {
		const [conference] = await tx
			.select({
				id: conferenceTable.id,
				predecessorConferenceId: conferenceTable.predecessorConferenceId
			})
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conferenceId))
			.limit(1);

		if (!conference?.predecessorConferenceId) {
			return { ok: false, reason: 'no_predecessor' };
		}

		const [submission] = await tx
			.select({
				id: submissionTable.id,
				status: submissionTable.status
			})
			.from(submissionTable)
			.where(
				and(
					eq(submissionTable.id, predecessorSubmissionId),
					eq(submissionTable.conferenceId, conference.predecessorConferenceId),
					eq(submissionTable.status, 'rejected')
				)
			)
			.limit(1);

		if (!submission) return { ok: false, reason: 'not_found' };

		await tx
			.insert(carryForwardTable)
			.values({
				conferenceId,
				predecessorSubmissionId,
				disposition
			})
			.onConflictDoUpdate({
				target: [carryForwardTable.conferenceId, carryForwardTable.predecessorSubmissionId],
				set: { disposition }
			});

		if (disposition === 'invited') {
			await seatSpeakersOnThisEdition(tx, conferenceId, predecessorSubmissionId);
		}

		return { ok: true, disposition };
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seatSpeakersOnThisEdition(
	tx: Tx,
	conferenceId: number,
	predecessorSubmissionId: number
) {
	const speakers = await tx
		.select({ speakerProfileId: submissionSpeakerTable.speakerProfileId })
		.from(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.submissionId, predecessorSubmissionId));

	for (const speaker of speakers) {
		await tx
			.insert(conferenceSpeakerTable)
			.values({
				conferenceId,
				speakerProfileId: speaker.speakerProfileId,
				status: 'invited'
			})
			.onConflictDoNothing();
	}
}
