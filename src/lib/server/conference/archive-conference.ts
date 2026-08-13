/**
 * Archiving a conference, and putting it back.
 *
 * This is the product's delete. Everything an organizer would call "deleting the
 * event" happens here: the conference stops being public, stops taking
 * submissions, and stops appearing anywhere a visitor can reach — but every row
 * is still there, and one call puts it back exactly as it was.
 *
 * It costs almost nothing to enforce, which is why it is the default rather than
 * the hard delete. Every public read in the product already asks for
 * `status = 'published'` — `loadPublicConference`, `listPublishedConferences`,
 * `loadSpeakerAppearances`, `openCall`. Moving the row to `archived` therefore
 * takes it out of all of them at once, and no query had to learn a new rule. A
 * separate `archived_at` flag next to a live `status` would have needed the
 * opposite: every one of those predicates rewritten, and any that was missed
 * would still be serving a "deleted" conference to the public.
 *
 * Who may do it is the rule `create-conference.ts` and `access.ts` already use:
 * an org-wide `owner` or `admin` seat. A scoped `organizer` membership is granted
 * *on* a conference, so it is the right to work on that event, not the right to
 * take it off the internet.
 *
 * The safeguards are graded by what the step actually costs:
 *
 *  - archiving a draft — nobody outside the organization can tell. Seat only.
 *  - archiving a published conference — a public address goes dark under people
 *    who have the link. Seat, plus the caller has to name the conference twice.
 *  - restoring — undoes the above. Seat only; the guard belongs on the way down,
 *    not on the way back.
 *  - deleting for good (`delete-conference.ts`) — no undo. Everything above, plus
 *    the conference must already be archived and must never have been published.
 */
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

/** Better Auth's org-wide roles that may archive, restore or delete. Mirrors `create-conference.ts`. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

/** Whether this user holds an org-wide seat on the conference's organization. */
export async function hasOrgWideSeat(userId: string, organizationId: string): Promise<boolean> {
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

export type ArchiveResult =
	| { ok: true; wasPublic: boolean }
	| { ok: false; reason: 'not_org_wide' | 'already_archived' };

export type RestoreResult =
	| { ok: true; status: 'draft' | 'published' }
	| { ok: false; reason: 'not_org_wide' | 'not_archived' };

/**
 * Take a conference out of circulation, keeping every row.
 *
 * The update repeats `status != 'archived'` as a predicate rather than trusting
 * the row that was read: two callers archiving at once would otherwise both
 * write, and the second would overwrite `statusBeforeArchive` with `archived` —
 * turning a restorable conference into one that restores itself to the state it
 * is already in. The predicate makes the first writer win and the second report
 * that it was already done.
 */
export async function archiveConference(
	conference: Conference,
	userId: string
): Promise<ArchiveResult> {
	if (!(await hasOrgWideSeat(userId, conference.organizationId))) {
		return { ok: false, reason: 'not_org_wide' };
	}
	if (conference.status === 'archived') {
		return { ok: false, reason: 'already_archived' };
	}

	const [archived] = await db
		.update(conferenceTable)
		.set({ status: 'archived', statusBeforeArchive: conference.status })
		.where(
			and(
				eq(conferenceTable.id, conference.id),
				isNull(conferenceTable.statusBeforeArchive),
				inArray(conferenceTable.status, ['draft', 'published'])
			)
		)
		.returning({ statusBeforeArchive: conferenceTable.statusBeforeArchive });

	if (!archived) return { ok: false, reason: 'already_archived' };

	return { ok: true, wasPublic: archived.statusBeforeArchive === 'published' };
}

/**
 * Put it back where it was.
 *
 * Back to `published` if that is where it came from — undo means the state
 * before, not a safer state that nobody asked for. An organizer who wanted it to
 * come back as a draft has `unpublish_conference`, and one who is surprised to
 * find it live again would have been more surprised to find their public page
 * still dark after restoring it.
 */
export async function restoreConference(
	conference: Conference,
	userId: string
): Promise<RestoreResult> {
	if (!(await hasOrgWideSeat(userId, conference.organizationId))) {
		return { ok: false, reason: 'not_org_wide' };
	}
	if (conference.status !== 'archived') {
		return { ok: false, reason: 'not_archived' };
	}

	// `statusBeforeArchive` is null for a row that reached `archived` some other
	// way — a hand-written UPDATE, or a database that predates this column. Draft
	// is the honest answer there: it is the state that claims the least.
	const restoredTo = conference.statusBeforeArchive === 'published' ? 'published' : 'draft';

	const [restored] = await db
		.update(conferenceTable)
		.set({ status: restoredTo, statusBeforeArchive: null })
		.where(and(eq(conferenceTable.id, conference.id), eq(conferenceTable.status, 'archived')))
		.returning({ status: conferenceTable.status });

	if (!restored) return { ok: false, reason: 'not_archived' };

	return { ok: true, status: restoredTo };
}
