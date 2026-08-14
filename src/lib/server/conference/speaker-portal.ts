/**
 * What a speaker sees about their own participation (CNT-02).
 *
 * Every query here is anchored on `speaker_profile.userId = <signed-in user>`.
 * That is the whole authorization model for this surface, and it is deliberately
 * expressed in the `where` of each query rather than as a separate check: a
 * submission you are not a speaker on cannot be selected, so there is no moment
 * where the wrong row exists in memory and something downstream has to remember
 * to drop it.
 */
import type { ProposalDraft } from '$lib/conference/proposal-draft';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	sessionFormatTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

/**
 * Attach this account to every profile that already stands for it.
 *
 * A speaker profile is created with no `userId` whenever someone other than its
 * owner names them: the organizer's roster (`speakers.ts`) and the co-speaker path
 * (`cfp-submission.ts`) both identify a speaker by `(organization, email)` and
 * neither can know whether that person has signed up. Submitting a proposal claims
 * such a profile, but a co-speaker never submits — by definition someone else did
 * — so on a two-person talk that leaves half the speakers holding tasks and
 * proposals they cannot see.
 *
 * Reconciling here rather than at sign-in is deliberate. The moment a profile
 * becomes claimable is the moment someone else names you, which the auth layer
 * cannot observe: a co-speaker added while you are already signed in would stay
 * invisible until you next logged out. This runs on the read that would otherwise
 * miss them.
 *
 * The address compared is the account's, so the claim is only as strong as the
 * deployment's signup check — see `upsertOwnProfile`, which makes the same trade
 * on the write side.
 *
 * The account's address is read in the same statement rather than fetched first.
 * Every query on this deployment is a round trip to another region, so a lookup
 * whose only consumer is the next statement's `where` is a round trip the page
 * pays and nobody reads. Postgres compares the addresses; we do not need to see
 * them. An account with no address matches nothing — `= null` is never true —
 * which is the same no-op the explicit guard used to perform.
 */
export async function claimProfilesForAccount(userId: string): Promise<void> {
	await db
		.update(speakerProfileTable)
		.set({ userId })
		.where(
			and(
				isNull(speakerProfileTable.userId),
				eq(
					speakerProfileTable.email,
					sql`(select ${user.email} from ${user} where ${user.id} = ${userId})`
				)
			)
		);
}

/**
 * The profile ids this user speaks under, across every organization.
 *
 * Claim and read are one statement, and that is the point: the read has to see
 * what the claim just wrote, so as two statements they cannot be pipelined and
 * the page waits out both round trips in series. `union` rather than a second
 * read of the table because a statement does not see its own CTE's write — the
 * select runs against the snapshot the update started from, so the rows
 * `claimed` returns are exactly the ones it would otherwise miss.
 */
async function ownProfileIds(userId: string): Promise<number[]> {
	const rows = await db.execute<{ id: number }>(sql`
		with claimed as (
			update ${speakerProfileTable} as sp
			set user_id = u.id
			from ${user} as u
			where u.id = ${userId} and sp.user_id is null and sp.email = u.email
			returning sp.id
		)
		select id from ${speakerProfileTable} where user_id = ${userId}
		union
		select id from claimed
	`);

	return [...rows].map((r) => r.id);
}

export type PortalSubmission = {
	id: number;
	title: string;
	status: string;
	submittedAt: Date | null;
	decidedAt: Date | null;
	isPrimary: boolean;
	conference: { slug: string; name: string };
};

/**
 * Everything this person has proposed, newest first.
 *
 * Co-presented talks are included — being added to someone else's proposal is
 * exactly the case where a speaker needs a place to see what they were signed up
 * for (ABS-11 puts the co-author in the organizer's views; this is the other end
 * of the same fact).
 */
export async function mySubmissions(userId: string): Promise<PortalSubmission[]> {
	const profileIds = await ownProfileIds(userId);
	if (profileIds.length === 0) return [];

	return db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			submittedAt: submissionTable.submittedAt,
			decidedAt: submissionTable.decidedAt,
			isPrimary: submissionSpeakerTable.isPrimary,
			conference: { slug: conferenceTable.slug, name: conferenceTable.name }
		})
		.from(submissionTable)
		.innerJoin(submissionSpeakerTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
		.where(inArray(submissionSpeakerTable.speakerProfileId, profileIds))
		.orderBy(desc(submissionTable.updatedAt));
}

export type PortalTask = {
	id: number;
	submissionId: number | null;
	title: string;
	instructions: string | null;
	status: string;
	dueOn: Date | null;
	conference: { slug: string; name: string };
	submissionTitle: string | null;
};

/**
 * The speaker's own to-do list, soonest deadline first.
 *
 * Tasks with no deadline sort last rather than first: `nulls last` is the
 * difference between "nothing is urgent" and "everything undated looks overdue".
 */
export async function myTasks(userId: string): Promise<PortalTask[]> {
	const profileIds = await ownProfileIds(userId);
	if (profileIds.length === 0) return [];

	return db
		.select({
			id: taskTable.id,
			submissionId: taskTable.submissionId,
			title: taskTable.title,
			instructions: taskTable.instructions,
			status: taskTable.status,
			dueOn: taskTable.dueOn,
			conference: { slug: conferenceTable.slug, name: conferenceTable.name },
			submissionTitle: submissionTable.title
		})
		.from(taskTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, taskTable.conferenceId))
		.leftJoin(submissionTable, eq(submissionTable.id, taskTable.submissionId))
		.where(inArray(taskTable.speakerProfileId, profileIds))
		.orderBy(sql`${taskTable.dueOn} asc nulls last`, asc(taskTable.id));
}

/**
 * One submission in full, or null if this user is not a speaker on it.
 *
 * Null rather than a thrown 403, for the same reason `requireOrganizer` answers
 * 404 both times: telling someone that a submission exists but is not theirs is
 * information they did not have.
 */
async function ownedSubmissionRow(userId: string, submissionId: number) {
	const [row] = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			abstract: submissionTable.abstract,
			keyTakeaway: submissionTable.keyTakeaway,
			audienceLevel: submissionTable.audienceLevel,
			status: submissionTable.status,
			submittedAt: submissionTable.submittedAt,
			decidedAt: submissionTable.decidedAt,
			conferenceId: submissionTable.conferenceId,
			conferenceSlug: conferenceTable.slug,
			conferenceName: conferenceTable.name,
			formatName: sessionFormatTable.name,
			trackName: trackTable.name
		})
		.from(submissionTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
		.innerJoin(submissionSpeakerTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.where(and(eq(submissionTable.id, submissionId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	return row ?? null;
}

export async function mySubmission(userId: string, submissionId: number) {
	// The list reconciles through `ownProfileIds`; a deep link arrives without ever
	// having gone through it, and answering 404 for a talk that is genuinely this
	// person's is the exact symptom this module is meant to have stopped producing.
	await claimProfilesForAccount(userId);

	const row = await ownedSubmissionRow(userId, submissionId);
	if (!row) return null;

	const [answers, speakers] = await Promise.all([
		db
			.select({
				label: formFieldTable.label,
				kind: formFieldTable.kind,
				value: submissionAnswerTable.value
			})
			.from(submissionAnswerTable)
			.innerJoin(formFieldTable, eq(formFieldTable.id, submissionAnswerTable.formFieldId))
			.where(eq(submissionAnswerTable.submissionId, submissionId))
			.orderBy(asc(formFieldTable.position), asc(formFieldTable.id)),
		db
			.select({
				name: speakerProfileTable.name,
				roleLabel: submissionSpeakerTable.roleLabel,
				isPrimary: submissionSpeakerTable.isPrimary
			})
			.from(submissionSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
			)
			.where(eq(submissionSpeakerTable.submissionId, submissionId))
			.orderBy(asc(submissionSpeakerTable.position))
	]);

	return { ...row, answers, speakers };
}

/** The draft's own columns, only if this user may still edit it. */
async function draftRow(userId: string, submissionId: number) {
	const [row] = await db
		.select({
			title: submissionTable.title,
			abstract: submissionTable.abstract,
			keyTakeaway: submissionTable.keyTakeaway,
			audienceLevel: submissionTable.audienceLevel,
			sessionFormatId: submissionTable.sessionFormatId,
			trackId: submissionTable.trackId,
			status: submissionTable.status,
			conferenceSlug: conferenceTable.slug,
			organizationId: conferenceTable.organizationId
		})
		.from(submissionTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
		.innerJoin(submissionSpeakerTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(and(eq(submissionTable.id, submissionId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	// Editable for as long as the call is open — the route checks that separately,
	// and `refuseSave` checks it again on the write. What is not editable here is a
	// proposal that has been decided: the organizers judged those words. Review
	// merely having started does not end the right (CFP-09); the decision does.
	return row && (row.status === 'draft' || row.status === 'submitted' || row.status === 'in_review')
		? row
		: null;
}

/** Answers keyed by field id, which is what the form's `answer:<id>` inputs need. */
async function draftAnswers(submissionId: number): Promise<Record<number, string>> {
	const rows = await db
		.select({ formFieldId: submissionAnswerTable.formFieldId, value: submissionAnswerTable.value })
		.from(submissionAnswerTable)
		.where(eq(submissionAnswerTable.submissionId, submissionId));
	return Object.fromEntries(rows.map((a) => [a.formFieldId, a.value ?? '']));
}

async function draftSpeakers(submissionId: number) {
	return db
		.select({
			name: speakerProfileTable.name,
			email: speakerProfileTable.email,
			roleLabel: submissionSpeakerTable.roleLabel,
			isPrimary: submissionSpeakerTable.isPrimary
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(eq(submissionSpeakerTable.submissionId, submissionId))
		.orderBy(asc(submissionSpeakerTable.position));
}

/**
 * The submitter's own profile in ONE organization, as blank strings rather than
 * nulls — inputs take strings.
 *
 * Scoped by organization to match the write. Without it, someone who speaks at
 * two organizations gets an arbitrary one of their profiles prefilled into this
 * form, and saving carries the bio and company of org A quietly into org B.
 */
async function ownProfile(
	userId: string,
	organizationId: string
): Promise<ProposalDraft['speaker']> {
	const [own] = await db
		.select({
			name: speakerProfileTable.name,
			sortName: speakerProfileTable.sortName,
			email: speakerProfileTable.email,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			bio: speakerProfileTable.bio
		})
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.userId, userId),
				eq(speakerProfileTable.organizationId, organizationId)
			)
		)
		.limit(1);

	const blank = { name: '', sortName: '', email: '', jobTitle: '', company: '', bio: '' };
	if (!own) return blank;

	// `name` and `sortName` are NOT NULL; the rest are nullable and become ''.
	return Object.fromEntries(
		Object.entries(own).map(([key, value]) => [key, value ?? ''])
	) as ProposalDraft['speaker'];
}

/**
 * A proposal in the shape the form fills from, or null if this user may not edit it.
 *
 * "May not edit" folds together three refusals — no such submission, not yours,
 * already decided — and answers null to all of them, so the route can return one
 * 404 rather than telling a stranger which of the three applied.
 *
 * `status` comes back with it because the two editable states read differently to
 * the person editing: an unfinished draft nobody has seen, and a proposal that is
 * already in front of the organizers and must stay there.
 */
export async function editableDraft(
	userId: string,
	submissionId: number
): Promise<{ draft: ProposalDraft; conferenceSlug: string; status: string } | null> {
	const row = await draftRow(userId, submissionId);
	if (!row) return null;

	const [answers, speakers, own] = await Promise.all([
		draftAnswers(submissionId),
		draftSpeakers(submissionId),
		ownProfile(userId, row.organizationId)
	]);

	const draft: ProposalDraft = {
		title: row.title,
		abstract: row.abstract ?? '',
		keyTakeaway: row.keyTakeaway ?? '',
		audienceLevel: row.audienceLevel ?? '',
		sessionFormatId: row.sessionFormatId,
		trackId: row.trackId,
		answers,
		speaker: own,
		coSpeakers: speakers
			.filter((sp) => !sp.isPrimary)
			.map((sp) => ({ name: sp.name, email: sp.email ?? '', roleLabel: sp.roleLabel ?? '' }))
	};

	return { draft, conferenceSlug: row.conferenceSlug, status: row.status };
}

/**
 * What this user already has in front of this conference, if anything.
 *
 * The public call renders a blank form, so without this a submitter who already
 * proposed something sees no sign of it and a second save makes a second
 * proposal. That is not hypothetical: it is where the duplicate pairs in the
 * organizer's list came from, because re-using the form was the only way anyone
 * could amend a talk once it was in.
 *
 * Deliberately only the id, title and status: this is a signpost, not a load. The
 * status is what lets the call word it correctly — "finish it" and "you already
 * sent this" are different sentences.
 */
export async function submissionForConference(userId: string, conferenceId: number) {
	const [row] = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status
		})
		.from(submissionTable)
		.innerJoin(submissionSpeakerTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				eq(speakerProfileTable.userId, userId),
				inArray(submissionTable.status, ['draft', 'submitted', 'in_review'])
			)
		)
		// A draft first when there is both: the unfinished one is the one still
		// asking for something.
		.orderBy(asc(submissionTable.status), desc(submissionTable.updatedAt))
		.limit(1);

	return row ?? null;
}
