/**
 * Naming the previous edition of a conference (#448).
 *
 * The column is the whole feature for now: no talks, no scores, no invite
 * lane travel with the pointer. The rules that have to hold before any of
 * that can sit on top are here — same organization, not itself, no cycle.
 *
 * The caller re-checks that the user organizes the conference. This function
 * re-checks the row in its own queries so a stale id cannot write across orgs.
 */
import { predecessorWouldCycle } from '$lib/conference/predecessor';
import { db } from '$lib/server/db';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { and, eq, inArray } from 'drizzle-orm';

export type EditionRef = { id: number; name: string; slug: string };

export type ConferenceWithEdition = Conference & {
	predecessor: EditionRef | null;
	predecessorOptions: EditionRef[];
};

export type PredecessorResult =
	| { ok: true; predecessorId: number | null }
	| { ok: false; reason: 'not_found' | 'self' | 'cycle' };

const editionColumns = {
	id: conferenceTable.id,
	name: conferenceTable.name,
	slug: conferenceTable.slug,
	organizationId: conferenceTable.organizationId,
	predecessorConferenceId: conferenceTable.predecessorConferenceId
} as const;

function asRef(row: { id: number; name: string; slug: string }): EditionRef {
	return { id: row.id, name: row.name, slug: row.slug };
}

/**
 * Attach the named predecessor and the other editions in the same org, so the
 * manage list can show the relationship and offer a form without a second
 * round-trip per row.
 */
export async function withEditionLinks(
	conferences: Conference[]
): Promise<ConferenceWithEdition[]> {
	if (conferences.length === 0) return [];

	const orgIds = [...new Set(conferences.map((conference) => conference.organizationId))];
	const siblings = await db
		.select({
			id: conferenceTable.id,
			name: conferenceTable.name,
			slug: conferenceTable.slug,
			organizationId: conferenceTable.organizationId
		})
		.from(conferenceTable)
		.where(inArray(conferenceTable.organizationId, orgIds));

	const byId = new Map(siblings.map((row) => [row.id, row]));

	return conferences.map((conference) => {
		const predecessorRow = conference.predecessorConferenceId
			? byId.get(conference.predecessorConferenceId)
			: undefined;
		return {
			...conference,
			predecessor: predecessorRow ? asRef(predecessorRow) : null,
			predecessorOptions: siblings
				.filter(
					(row) => row.organizationId === conference.organizationId && row.id !== conference.id
				)
				.map(asRef)
				.sort((a, b) => a.name.localeCompare(b.name))
		};
	});
}

export async function setConferencePredecessor(
	conferenceId: number,
	predecessorId: number | null
): Promise<PredecessorResult> {
	return db.transaction(async (tx) => {
		const [conference] = await tx
			.select({
				id: conferenceTable.id,
				organizationId: conferenceTable.organizationId
			})
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conferenceId))
			.limit(1);

		if (!conference) return { ok: false, reason: 'not_found' };

		if (predecessorId === null) {
			await tx
				.update(conferenceTable)
				.set({ predecessorConferenceId: null })
				.where(eq(conferenceTable.id, conferenceId));
			return { ok: true, predecessorId: null };
		}

		return writePredecessor(tx, conference, predecessorId);
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ConferenceRef = { id: number; organizationId: string };

async function writePredecessor(
	tx: Tx,
	conference: ConferenceRef,
	predecessorId: number
): Promise<PredecessorResult> {
	if (predecessorId === conference.id) return { ok: false, reason: 'self' };

	const [predecessor] = await tx
		.select(editionColumns)
		.from(conferenceTable)
		.where(eq(conferenceTable.id, predecessorId))
		.limit(1);

	// Another org is not_found, not a distinct reason: confirming the row
	// exists would leak a conference the caller has no business seeing.
	if (!predecessor || predecessor.organizationId !== conference.organizationId) {
		return { ok: false, reason: 'not_found' };
	}

	const orgLinks = await tx
		.select({
			id: conferenceTable.id,
			predecessorConferenceId: conferenceTable.predecessorConferenceId
		})
		.from(conferenceTable)
		.where(eq(conferenceTable.organizationId, conference.organizationId));

	const links = new Map(orgLinks.map((row) => [row.id, row.predecessorConferenceId] as const));
	if (predecessorWouldCycle(conference.id, predecessorId, links)) {
		return { ok: false, reason: 'cycle' };
	}

	const [updated] = await tx
		.update(conferenceTable)
		.set({ predecessorConferenceId: predecessorId })
		.where(
			and(
				eq(conferenceTable.id, conference.id),
				eq(conferenceTable.organizationId, conference.organizationId)
			)
		)
		.returning({ id: conferenceTable.id });

	if (!updated) return { ok: false, reason: 'not_found' };
	return { ok: true, predecessorId };
}
