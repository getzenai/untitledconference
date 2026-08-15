/**
 * The editorial stand on an accepted talk (#446).
 *
 * Not a status. The talk is accepted; this is the sentence the organizer
 * names for where the deck actually is. Setting it, advancing it or leaving
 * it unset does not touch the slot, the speaker tasks or the confirmation.
 */
import {
	editorialBlockingRank,
	isHangingEditorialStand,
	nextEditorialStand,
	type EditorialStand
} from '$lib/conference/editorial-stand';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { and, eq, isNotNull, ne } from 'drizzle-orm';

export type HangingStand = {
	submissionId: number;
	title: string;
	stand: EditorialStand;
};

export type SetStandResult =
	| { ok: true; stand: EditorialStand }
	| { ok: false; reason: 'not_found' | 'not_accepted' | 'already_final' };

/**
 * Accepted talks whose stand is set and not `final`. Sorted by what is
 * blocking, then by when they were decided — the pile on the chase board.
 */
export async function hangingEditorialStands(conferenceId: number): Promise<HangingStand[]> {
	const rows = await db
		.select({
			submissionId: submissionTable.id,
			title: submissionTable.title,
			stand: submissionTable.editorialStand,
			decidedAt: submissionTable.decidedAt
		})
		.from(submissionTable)
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				eq(submissionTable.status, 'accepted'),
				isNotNull(submissionTable.editorialStand),
				ne(submissionTable.editorialStand, 'final')
			)
		);

	return rows
		.flatMap((row) => {
			if (!isHangingEditorialStand(row.stand)) return [];
			return [
				{
					submissionId: row.submissionId,
					title: row.title,
					stand: row.stand,
					decidedAt: row.decidedAt
				}
			];
		})
		.sort((a, b) => {
			const rank = editorialBlockingRank(a.stand) - editorialBlockingRank(b.stand);
			if (rank !== 0) return rank;
			const aTime = a.decidedAt?.getTime() ?? 0;
			const bTime = b.decidedAt?.getTime() ?? 0;
			return aTime - bTime || a.submissionId - b.submissionId;
		})
		.map(({ decidedAt: _decidedAt, ...row }) => row);
}

async function acceptedOnThisConference(conferenceId: number, submissionId: number) {
	const [existing] = await db
		.select({
			id: submissionTable.id,
			status: submissionTable.status,
			editorialStand: submissionTable.editorialStand
		})
		.from(submissionTable)
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);
	return existing ?? null;
}

/**
 * Names the stand. The talk stays accepted — this is the rewrite, not a
 * decision.
 */
export async function setEditorialStand(
	conferenceId: number,
	submissionId: number,
	stand: EditorialStand
): Promise<SetStandResult> {
	const existing = await acceptedOnThisConference(conferenceId, submissionId);
	if (!existing) return { ok: false, reason: 'not_found' };
	if (existing.status !== 'accepted') return { ok: false, reason: 'not_accepted' };

	await db
		.update(submissionTable)
		.set({ editorialStand: stand })
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);

	return { ok: true, stand };
}

/**
 * Moves one step along the named line. An unset talk starts at materials
 * requested. `final` has nowhere to go.
 */
export async function advanceEditorialStand(
	conferenceId: number,
	submissionId: number
): Promise<SetStandResult> {
	const existing = await acceptedOnThisConference(conferenceId, submissionId);
	if (!existing) return { ok: false, reason: 'not_found' };
	if (existing.status !== 'accepted') return { ok: false, reason: 'not_accepted' };

	const next = nextEditorialStand(existing.editorialStand);
	if (!next) return { ok: false, reason: 'already_final' };

	return setEditorialStand(conferenceId, submissionId, next);
}
