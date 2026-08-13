/**
 * Removing a conference.
 *
 * The counterpart to `create-conference.ts`, and it borrows that file's rule
 * about who may do it: a scoped `organizer` membership is granted *on* an
 * existing conference, so it cannot be the right to destroy that conference any
 * more than it is the right to make a new one. Only Better Auth's org-wide
 * `owner` and `admin` seats can — the seats that own the data, not the seats
 * invited to work on it.
 *
 * Drafts only. A published conference has a public address people have followed
 * and, usually, speakers who handed something in; taking it out from under them
 * is not an operation this offers.
 *
 * What goes with it is what the schema already says goes with it — every table
 * under `conference.id` cascades. What stays is `speaker_profile`: that record
 * is org-wide on purpose (CRM-01, the cross-event directory), so a person who
 * spoke once does not vanish because one event did.
 */
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	roomTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { and, count, eq, inArray } from 'drizzle-orm';

/** Better Auth's org-wide roles that may delete a conference. Mirrors `create-conference.ts`. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

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
	| { ok: false; reason: 'not_org_wide' | 'not_draft' };

/** Whether this user holds an org-wide seat on the conference's organization. */
async function hasOrgWideSeat(userId: string, organizationId: string): Promise<boolean> {
	const [seat] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.userId, userId),
				eq(member.organizationId, organizationId),
				inArray(member.role, ORG_WIDE_ORGANIZER_ROLES)
			)
		)
		.limit(1);

	return seat !== undefined;
}

export async function deleteConference(
	conference: Conference,
	userId: string
): Promise<DeleteConferenceResult> {
	if (!(await hasOrgWideSeat(userId, conference.organizationId))) {
		return { ok: false, reason: 'not_org_wide' };
	}
	if (conference.status !== 'draft') {
		return { ok: false, reason: 'not_draft' };
	}

	// Counted inside the transaction that deletes, so the numbers reported are the
	// rows that actually went rather than a snapshot from before someone else's write.
	//
	// `status = 'draft'` is repeated in the delete itself, not trusted from the row
	// read above: between that read and this write someone can publish, and a
	// conference with a public address is the one thing this must never remove. If
	// the predicate finds nothing, the publish won the race and nothing goes.
	return await db.transaction(async (tx) => {
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

		const gone = await tx
			.delete(conferenceTable)
			.where(and(eq(conferenceTable.id, conference.id), eq(conferenceTable.status, 'draft')))
			.returning({ id: conferenceTable.id });

		if (gone.length === 0) return { ok: false, reason: 'not_draft' };

		return {
			ok: true,
			removed: { rooms: rooms.n, submissions: submissions.n, speakers: speakers.n }
		};
	});
}
