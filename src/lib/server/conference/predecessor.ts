/**
 * Naming the previous edition of a conference (#448).
 *
 * The pointer the carry-forward invite lane reads. Talks, scores and
 * dispositions live on `carry_forward`; the rules that have to hold
 * before that lane can sit on top are here — same organization, not
 * itself, no cycle.
 *
 * The caller re-checks that the user organizes the conference, and the
 * predecessor too. This function re-checks the row in its own queries so a
 * stale id cannot write across orgs.
 */
import {
	editionOptions,
	namedPredecessor,
	predecessorWouldCycle,
	type EditionRef
} from '$lib/conference/predecessor';
import { db } from '$lib/server/db';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { and, eq } from 'drizzle-orm';

export type { EditionRef };

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

/**
 * Attach the named predecessor and the other editions the caller already
 * organizes. Options come from that list, not from a new org-wide query —
 * a scoped organizer invited to one conference must not see the names of
 * the ones `requireOrganizer` would 404.
 */
export function withEditionLinks(conferences: Conference[]): ConferenceWithEdition[] {
	return conferences.map((conference) => ({
		...conference,
		predecessor: namedPredecessor(conferences, conference.predecessorConferenceId),
		predecessorOptions: editionOptions(conferences, conference)
	}));
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
