/**
 * The write side of the internal sponsor axis (#434).
 *
 * The schema has held `sponsor_tier` and `submission.sponsor_tier_id` since the
 * first conference migration. Until now the only writers were the integration
 * fixture and the demo seed — the organizer could see the badge and could not
 * put it there. This module is that writer: the tiers themselves (settings)
 * and the assignment on one submission (the detail page).
 *
 * A separate file from `organizer-submissions` for the same reason `recordings`
 * is: that one is the reading side and says so in its header. The conference
 * is in every WHERE clause. An id that arrives from a form is never a claim
 * about which conference it belongs to.
 *
 * Nothing here is public. `public-conference.ts` deliberately omits
 * `sponsorTierId` from the projection; these functions never feed that query.
 */
import { MAX_NAME } from '$lib/conference/structure-lines';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { sponsorTierTable } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, sql } from 'drizzle-orm';

export type SponsorTierRow = {
	id: number;
	name: string;
	note: string | null;
	position: number;
};

/** What assigning (or clearing) a tier on one submission did. */
export type SponsorAssignmentResult =
	| { ok: true; changed: boolean }
	| { ok: false; reason: 'not_found' | 'invalid_tier' };

/** What a rename or a removal ran into, in the words the form prints back. */
export type SponsorTierProblem = string | null;

const COUNT = { count: sql<number>`count(*)::int` };

function oneLine(raw: string): string {
	return raw.replace(/\n/g, ' ').trim().slice(0, MAX_NAME);
}

function optionalNote(raw: string | null): string | null {
	const note = (raw ?? '').trim();
	return note || null;
}

function plural(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export async function sponsorTiers(conferenceId: number): Promise<SponsorTierRow[]> {
	return db
		.select({
			id: sponsorTierTable.id,
			name: sponsorTierTable.name,
			note: sponsorTierTable.note,
			position: sponsorTierTable.position
		})
		.from(sponsorTierTable)
		.where(eq(sponsorTierTable.conferenceId, conferenceId))
		.orderBy(asc(sponsorTierTable.position), asc(sponsorTierTable.id));
}

/**
 * One new tier, appended after whatever is already on the list.
 *
 * Position is assigned, not asked for: an organizer adding "Gold" is naming a
 * category, not numbering it. Reordering is the edit on the row they just made.
 */
export async function addSponsorTier(
	conferenceId: number,
	rawName: string,
	rawNote: string | null
): Promise<{ ok: true; id: number } | { ok: false; problem: string }> {
	const name = oneLine(rawName);
	if (!name) return { ok: false, problem: 'Give the sponsor tier a name.' };

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ name: sponsorTierTable.name, position: sponsorTierTable.position })
			.from(sponsorTierTable)
			.where(eq(sponsorTierTable.conferenceId, conferenceId));

		const taken = rows.some((row) => row.name.trim().toLowerCase() === name.toLowerCase());
		if (taken) return { ok: false, problem: `There is already a sponsor tier called "${name}".` };

		const next = rows.reduce((highest, row) => Math.max(highest, row.position), -1) + 1;
		const [created] = await tx
			.insert(sponsorTierTable)
			.values({ conferenceId, name, note: optionalNote(rawNote), position: next })
			.returning({ id: sponsorTierTable.id });

		return { ok: true, id: created.id };
	});
}

export async function updateSponsorTier(
	conferenceId: number,
	tierId: number,
	rawName: string,
	rawNote: string | null,
	position: number
): Promise<SponsorTierProblem> {
	if (!Number.isInteger(position) || position < 0) {
		return 'Order must be a whole number, 0 or more.';
	}

	const name = oneLine(rawName);
	if (!name) return 'Give the sponsor tier a name.';

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: sponsorTierTable.id, name: sponsorTierTable.name })
			.from(sponsorTierTable)
			.where(eq(sponsorTierTable.conferenceId, conferenceId));

		if (!rows.some((row) => row.id === tierId)) return 'That sponsor tier is gone.';

		const taken = rows.some(
			(row) => row.id !== tierId && row.name.trim().toLowerCase() === name.toLowerCase()
		);
		if (taken) return `There is already a sponsor tier called "${name}".`;

		await tx
			.update(sponsorTierTable)
			.set({ name, note: optionalNote(rawNote), position })
			.where(and(eq(sponsorTierTable.id, tierId), eq(sponsorTierTable.conferenceId, conferenceId)));
		return null;
	});
}

/**
 * A tier goes only when no submission still carries it.
 *
 * `submission.sponsor_tier_id` is `on delete set null`, so the database would
 * take the delete happily and silently un-mark every talk that used it. The
 * organizer would find that out on the submissions list, not here.
 */
export async function removeSponsorTier(
	conferenceId: number,
	tierId: number
): Promise<SponsorTierProblem> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: sponsorTierTable.id })
			.from(sponsorTierTable)
			.where(and(eq(sponsorTierTable.id, tierId), eq(sponsorTierTable.conferenceId, conferenceId)));
		if (!row) return 'That sponsor tier is gone.';

		const [{ count: marked }] = await tx
			.select(COUNT)
			.from(submissionTable)
			.where(eq(submissionTable.sponsorTierId, tierId));
		if (marked > 0) {
			return `${plural(marked, 'submission')} ${marked === 1 ? 'is' : 'are'} marked as this tier. Clear the marker ${marked === 1 ? 'there' : 'on them'} first — removing the tier here would drop it from ${marked === 1 ? 'that submission' : 'those submissions'} without saying so.`;
		}

		await tx
			.delete(sponsorTierTable)
			.where(and(eq(sponsorTierTable.id, tierId), eq(sponsorTierTable.conferenceId, conferenceId)));
		return null;
	});
}

/**
 * Sets (or, with null, clears) the sponsor tier of one submission.
 *
 * The tier id arrives from a select, so it is checked rather than trusted —
 * a neighbour conference's Gold must not land on this talk. Returns
 * `not_found` when the submission is not this conference's, so the route
 * can answer 404 rather than reporting a save that did not happen.
 */
export async function setSubmissionSponsorTier(
	conferenceId: number,
	submissionId: number,
	tierId: number | null
): Promise<SponsorAssignmentResult> {
	const [existing] = await db
		.select({ id: submissionTable.id, sponsorTierId: submissionTable.sponsorTierId })
		.from(submissionTable)
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);
	if (!existing) return { ok: false, reason: 'not_found' };

	if (tierId !== null) {
		const [tier] = await db
			.select({ id: sponsorTierTable.id })
			.from(sponsorTierTable)
			.where(and(eq(sponsorTierTable.id, tierId), eq(sponsorTierTable.conferenceId, conferenceId)));
		if (!tier) return { ok: false, reason: 'invalid_tier' };
	}

	if (existing.sponsorTierId === tierId) return { ok: true, changed: false };

	await db
		.update(submissionTable)
		.set({ sponsorTierId: tierId })
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);

	return { ok: true, changed: true };
}
