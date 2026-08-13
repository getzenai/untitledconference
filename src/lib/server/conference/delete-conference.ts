/**
 * Removing a conference for good.
 *
 * The last of the four steps in `archive-conference.ts`, and the only one with no
 * undo. Everything that makes a conference *go away* is that file's job; this one
 * exists solely to reclaim a row that is already gone from everyone's view.
 *
 * Three conditions, and each is doing different work:
 *
 *  - an org-wide `owner` or `admin` seat, the same rule as creating one. A scoped
 *    `organizer` membership is granted on an existing conference, so it cannot be
 *    the right to destroy it.
 *  - **already archived.** This is the real safeguard. Nothing can go from "in use"
 *    to "gone" in one call: the caller has to first put the conference in a state a
 *    human can see and reverse, and only then ask for the irreversible step. A
 *    waiting period would enforce the same pause with a clock; two deliberate acts
 *    enforce it with the caller's own hands.
 *  - **never published.** `statusBeforeArchive` remembers that. A conference that
 *    once had a public address has been linked to, and may have collected
 *    submissions from people who trusted the address; it can be archived, and that
 *    is as far as this goes.
 *
 * What goes with it is what the schema already says goes with it — every table
 * under `conference.id` cascades. What stays is `speaker_profile`: that record is
 * org-wide on purpose (CRM-01, the cross-event directory), so a person who spoke
 * once does not vanish because one event did.
 *
 * Two things the cascade cannot reach, and this file has to:
 *
 *  - `membership.scope_id` is polymorphic, so Postgres has no foreign key to
 *    cascade along (conference-schema.ts says so and leaves the cleanup to us).
 *    Left alone, every organizer and reviewer seat on the conference — and on its
 *    review rounds, which do cascade away — would outlive the row they name.
 *  - uploaded files. `deliverable.file_url` rows cascade, but the bytes live in
 *    the R2 bucket and nothing in this request can reach it. They are retained,
 *    and the tool says so rather than promising an erasure it cannot perform.
 */
import { hasOrgWideSeat } from '$lib/server/conference/archive-conference';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	membershipTable,
	roomTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { evaluationPlanTable, reviewRoundTable } from '$lib/server/db/conference/review-schema';
import { and, count, eq, inArray, or } from 'drizzle-orm';

/**
 * What the conference took with it.
 *
 * Reported rather than assumed: an organizer who deletes something bigger than
 * they thought should read what went, not discover it later. These three are
 * the rows a person recognises; the rest of the cascade is machinery.
 */
export type DeletedWith = {
	rooms: number;
	submissions: number;
	speakers: number;
};

export type DeleteConferenceResult =
	| { ok: true; removed: DeletedWith }
	| { ok: false; reason: 'not_org_wide' | 'not_archived' | 'was_published' };

export async function deleteConference(
	conference: Conference,
	userId: string
): Promise<DeleteConferenceResult> {
	if (!(await hasOrgWideSeat(userId, conference.organizationId))) {
		return { ok: false, reason: 'not_org_wide' };
	}
	if (conference.status !== 'archived') {
		return { ok: false, reason: 'not_archived' };
	}
	if (conference.statusBeforeArchive === 'published') {
		return { ok: false, reason: 'was_published' };
	}

	// Counted inside the transaction that deletes, so the numbers reported are the
	// rows that actually went rather than a snapshot from before someone else's write.
	//
	// Both conditions are asked again here, of a row locked FOR UPDATE, rather than
	// trusted from the read above. Between that read and this write another caller can
	// restore the conference, publish it and archive it again — and then the row this
	// call was allowed to erase is one that has had a public address. Re-reading under
	// the lock is what makes "never published" a guard rather than a hope: the racing
	// writer either finishes before the lock is taken, and is seen, or waits behind it.
	return await db.transaction(async (tx) => {
		const [fresh] = await tx
			.select({
				status: conferenceTable.status,
				statusBeforeArchive: conferenceTable.statusBeforeArchive
			})
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conference.id))
			.for('update');

		if (!fresh || fresh.status !== 'archived') return { ok: false, reason: 'not_archived' };
		if (fresh.statusBeforeArchive === 'published') return { ok: false, reason: 'was_published' };

		const [rooms] = await tx
			.select({ n: count() })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conference.id));
		const [submissions] = await tx
			.select({ n: count() })
			.from(submissionTable)
			.where(eq(submissionTable.conferenceId, conference.id));
		const [speakers] = await tx
			.select({ n: count() })
			.from(conferenceSpeakerTable)
			.where(eq(conferenceSpeakerTable.conferenceId, conference.id));

		// Read before the delete, because the rounds themselves cascade away with the
		// conference and their ids would be unrecoverable a statement later.
		const rounds = await tx
			.select({ id: reviewRoundTable.id })
			.from(reviewRoundTable)
			.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
			.where(eq(evaluationPlanTable.conferenceId, conference.id));

		const roundIds = rounds.map((r) => r.id);
		await tx
			.delete(membershipTable)
			.where(
				or(
					and(
						eq(membershipTable.scopeType, 'conference'),
						eq(membershipTable.scopeId, conference.id)
					),
					roundIds.length > 0
						? and(
								eq(membershipTable.scopeType, 'round'),
								inArray(membershipTable.scopeId, roundIds)
							)
						: undefined
				)
			);

		const gone = await tx
			.delete(conferenceTable)
			.where(and(eq(conferenceTable.id, conference.id), eq(conferenceTable.status, 'archived')))
			.returning({ id: conferenceTable.id });

		if (gone.length === 0) return { ok: false, reason: 'not_archived' };

		return {
			ok: true,
			removed: { rooms: rooms.n, submissions: submissions.n, speakers: speakers.n }
		};
	});
}
