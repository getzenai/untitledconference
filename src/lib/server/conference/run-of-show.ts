/**
 * The rows behind the run-of-show page (#449).
 *
 * The public agenda is the wrong source: it hides tentative slots and anything
 * whose content is not approved. The person at the table needs what is on the
 * grid, including the draft the organizer has not published yet. So this reads
 * the same placements the builder does, keeps anything with a start time, and
 * leaves tray rows out.
 *
 * Latest file is the newest upload on a `file_request` that belongs to the
 * talk. Speaker-level tasks (no submission) are someone else's headshot, not
 * this deck. Intro text and AV notes are not selected because they are not
 * columns.
 */
import { isoDay } from '$lib/conference/public-view';
import {
	runOfShow,
	type ShowFile,
	type ShowTalk,
	type ShowTalkInput
} from '$lib/conference/run-of-show';
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	roomTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

type PlacementRow = {
	submissionId: number | null;
	title: string | null;
	blockTitle: string | null;
	abstract: string | null;
	day: string | null;
	dayPosition: number | null;
	room: string | null;
	roomPosition: number | null;
	startsAt: Date;
	endsAt: Date | null;
};

function selectPlaced(conferenceId: number) {
	return db
		.select({
			submissionId: placementTable.submissionId,
			title: submissionTable.title,
			blockTitle: placementTable.title,
			abstract: submissionTable.abstract,
			day: conferenceDayTable.date,
			dayPosition: conferenceDayTable.position,
			room: roomTable.name,
			roomPosition: roomTable.position,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt
		})
		.from(placementTable)
		.leftJoin(submissionTable, eq(submissionTable.id, placementTable.submissionId))
		.leftJoin(conferenceDayTable, eq(conferenceDayTable.id, placementTable.conferenceDayId))
		.leftJoin(roomTable, eq(roomTable.id, placementTable.roomId))
		.where(
			and(
				eq(placementTable.conferenceId, conferenceId),
				sql`${placementTable.startsAt} is not null`
			)
		);
}

async function speakersBySubmission(
	ids: number[]
): Promise<Map<number, ShowTalkInput['speakers']>> {
	const byId = new Map<number, ShowTalkInput['speakers']>();
	if (ids.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			name: speakerProfileTable.name,
			position: submissionSpeakerTable.position
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, ids))
		.orderBy(asc(submissionSpeakerTable.position));

	for (const row of rows) {
		byId.set(row.submissionId, [...(byId.get(row.submissionId) ?? []), row]);
	}
	return byId;
}

/**
 * Newest upload per talk. Rows arrive newest first, so the first id seen wins.
 *
 * `uploaded_at` before `version` because two tasks on one talk are two decks,
 * and the one they handed in last is the one on the laptop backstage.
 */
async function latestFileBySubmission(ids: number[]): Promise<Map<number, ShowFile>> {
	const byId = new Map<number, ShowFile>();
	if (ids.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: taskTable.submissionId,
			id: deliverableTable.id,
			filename: deliverableTable.filename
		})
		.from(deliverableTable)
		.innerJoin(taskTable, eq(taskTable.id, deliverableTable.taskId))
		.where(and(inArray(taskTable.submissionId, ids), eq(taskTable.kind, 'file_request')))
		.orderBy(
			desc(deliverableTable.uploadedAt),
			desc(deliverableTable.version),
			desc(deliverableTable.id)
		);

	for (const row of rows) {
		if (row.submissionId === null || byId.has(row.submissionId)) continue;
		byId.set(row.submissionId, { id: row.id, filename: row.filename });
	}
	return byId;
}

function toInput(
	row: PlacementRow,
	speakers: Map<number, ShowTalkInput['speakers']>,
	files: Map<number, ShowFile>
): ShowTalkInput {
	const submissionId = row.submissionId;
	return {
		day: row.day ?? isoDay(row.startsAt),
		dayPosition: row.dayPosition ?? 0,
		room: row.room,
		roomPosition: row.roomPosition ?? -1,
		startsAt: row.startsAt,
		endsAt: row.endsAt,
		title: row.title ?? row.blockTitle ?? 'Untitled',
		abstract: row.abstract,
		speakers: submissionId ? (speakers.get(submissionId) ?? []) : [],
		file: submissionId ? (files.get(submissionId) ?? null) : null
	};
}

export async function runOfShowFor(conferenceId: number): Promise<ShowTalk[]> {
	const placed = (await selectPlaced(conferenceId)).filter(
		(row): row is PlacementRow => row.startsAt !== null
	);
	const submissionIds = placed
		.map((row) => row.submissionId)
		.filter((id): id is number => id !== null);
	const [speakers, files] = await Promise.all([
		speakersBySubmission(submissionIds),
		latestFileBySubmission(submissionIds)
	]);

	return runOfShow(placed.map((row) => toInput(row, speakers, files)));
}
