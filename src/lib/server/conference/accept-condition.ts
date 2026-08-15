/**
 * The note on a conditional accept (#445).
 *
 * Not a status. The talk is accepted; this is the sentence the committee actually
 * said ("if you bring a co-presenter") and the person who will chase it. Clearing
 * the note is how the talk comes off the edge. Leaving it up is how it stays
 * visibly at risk.
 *
 * The speaker-task table is the collection loop. This follow-up is organizer
 * work, so it lives on the submission and on the same chase board, not in a
 * speaker's portal.
 */
import { db } from '$lib/server/db';
import { member, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { membershipTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

/** A meeting note, not an essay. */
export const CONDITION_MAX = 280;

export type AcceptCondition = {
	text: string;
	ownerId: string;
};

export type ConditionOwner = {
	userId: string;
	name: string;
};

export type OpenCondition = {
	submissionId: number;
	title: string;
	condition: string;
	ownerId: string;
	ownerName: string;
};

export type ResolveConditionResult =
	| { ok: true; changed: boolean }
	| { ok: false; reason: 'not_found' };

export type UpdateConditionResult =
	| { ok: true }
	| { ok: false; reason: 'not_found' | 'not_accepted' | 'no_condition' | 'invalid_owner' };

/** `user.name` is nullable; the address is who they are when it is not set. */
function displayName(name: string | null, email: string): string {
	return name?.trim() || email;
}

function oneLine(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().slice(0, CONDITION_MAX);
}

/**
 * Who may own a follow-up on this conference: org-wide owners and admins, plus
 * anyone with an organizer seat on the event. A reviewer who cannot open the
 * chase board cannot resolve the note.
 */
export async function conferenceOrganizers(conference: Conference): Promise<ConditionOwner[]> {
	const orgWide = await db
		.select({ userId: member.userId, name: user.name, email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(
			and(
				eq(member.organizationId, conference.organizationId),
				inArray(member.role, ORG_WIDE_ORGANIZER_ROLES)
			)
		);

	const scoped = await db
		.select({ userId: membershipTable.userId, name: user.name, email: user.email })
		.from(membershipTable)
		.innerJoin(user, eq(user.id, membershipTable.userId))
		.where(
			and(
				eq(membershipTable.role, 'organizer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conference.id)
			)
		);

	const seen = new Map<string, ConditionOwner>();
	for (const row of [...orgWide, ...scoped]) {
		if (seen.has(row.userId)) continue;
		seen.set(row.userId, { userId: row.userId, name: displayName(row.name, row.email) });
	}

	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function isConferenceOrganizer(
	conference: Conference,
	userId: string
): Promise<boolean> {
	const owners = await conferenceOrganizers(conference);
	return owners.some((owner) => owner.userId === userId);
}

/**
 * Empty fields are a clean accept. One field without the other is a meeting
 * that named the work and not the person, or the other way around.
 */
export function parseAcceptCondition(
	form: FormData
): { ok: true; condition: AcceptCondition | null } | { ok: false; message: string } {
	const text = oneLine(String(form.get('condition') ?? ''));
	const ownerId = String(form.get('conditionOwnerId') ?? '').trim();
	const ownerPicked = ownerId !== '' && ownerId !== 'none';

	if (!text && !ownerPicked) return { ok: true, condition: null };
	if (!text) return { ok: false, message: 'Say what the accept depends on.' };
	if (!ownerPicked) return { ok: false, message: 'Pick who will follow this up.' };

	return { ok: true, condition: { text, ownerId } };
}

/**
 * What the accept button posted. A condition on Decline or Waitlist is leftover
 * form state and is dropped. An owner who cannot open this conference is
 * refused before the talk is decided, so we never write a note nobody can
 * resolve.
 */
export async function conditionForDecision(
	conference: Conference,
	form: FormData,
	decision: string
): Promise<{ ok: true; condition: AcceptCondition | null } | { ok: false; message: string }> {
	const parsed = parseAcceptCondition(form);
	if (!parsed.ok) return parsed;
	if (decision !== 'accepted' || !parsed.condition) return { ok: true, condition: null };
	if (!(await isConferenceOrganizer(conference, parsed.condition.ownerId))) {
		return { ok: false, message: 'That person cannot follow this up.' };
	}
	return parsed;
}

/** Open notes, oldest first — the pile an organizer walks on the chase board. */
export async function openAcceptConditions(conferenceId: number): Promise<OpenCondition[]> {
	const rows = await db
		.select({
			submissionId: submissionTable.id,
			title: submissionTable.title,
			condition: submissionTable.acceptCondition,
			ownerId: submissionTable.acceptConditionOwnerId,
			ownerName: user.name,
			ownerEmail: user.email
		})
		.from(submissionTable)
		.innerJoin(user, eq(user.id, submissionTable.acceptConditionOwnerId))
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				eq(submissionTable.status, 'accepted'),
				isNotNull(submissionTable.acceptCondition)
			)
		)
		.orderBy(asc(submissionTable.decidedAt), asc(submissionTable.id));

	return rows.flatMap((row) => {
		if (!row.condition || !row.ownerId) return [];
		return [
			{
				submissionId: row.submissionId,
				title: row.title,
				condition: row.condition,
				ownerId: row.ownerId,
				ownerName: displayName(row.ownerName, row.ownerEmail)
			}
		];
	});
}

/**
 * Resolving deletes the marker. The talk stays accepted — the slot, the
 * speaker tasks and the programme do not move.
 */
export async function resolveAcceptCondition(
	conferenceId: number,
	submissionId: number
): Promise<ResolveConditionResult> {
	const [existing] = await db
		.select({
			id: submissionTable.id,
			acceptCondition: submissionTable.acceptCondition,
			acceptConditionOwnerId: submissionTable.acceptConditionOwnerId
		})
		.from(submissionTable)
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);
	if (!existing) return { ok: false, reason: 'not_found' };

	if (existing.acceptCondition === null && existing.acceptConditionOwnerId === null) {
		return { ok: true, changed: false };
	}

	await db
		.update(submissionTable)
		.set({ acceptCondition: null, acceptConditionOwnerId: null })
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		);

	return { ok: true, changed: true };
}

/**
 * Rewrite the note on an already-accepted talk (#540). The talk stays
 * accepted — the slot, the speaker tasks and the confirmation do not
 * move. Clearing the note is `resolveAcceptCondition`; this is the
 * other direction.
 */
export async function updateAcceptCondition(
	conference: Conference,
	submissionId: number,
	condition: AcceptCondition
): Promise<UpdateConditionResult> {
	if (!(await isConferenceOrganizer(conference, condition.ownerId))) {
		return { ok: false, reason: 'invalid_owner' };
	}

	const [existing] = await db
		.select({
			id: submissionTable.id,
			status: submissionTable.status,
			acceptCondition: submissionTable.acceptCondition
		})
		.from(submissionTable)
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conference.id))
		);
	if (!existing) return { ok: false, reason: 'not_found' };
	if (existing.status !== 'accepted') return { ok: false, reason: 'not_accepted' };
	if (existing.acceptCondition === null) return { ok: false, reason: 'no_condition' };

	await db
		.update(submissionTable)
		.set({
			acceptCondition: condition.text,
			acceptConditionOwnerId: condition.ownerId
		})
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conference.id))
		);

	return { ok: true };
}
