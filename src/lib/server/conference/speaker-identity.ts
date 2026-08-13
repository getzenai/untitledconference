/**
 * Who a speaker profile is allowed to say it is.
 *
 * Its own module because the rule is not about proposals: `speaker_profile.email`
 * is a matching key across the whole organization — `upsertCoSpeaker` resolves a
 * co-presenter against it, `unclaimedProfileForEmail` claims a profile by it — and
 * the CFP form is only the place where a submitter can currently write one.
 */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { OpenCall, SaveResult } from './cfp-submission';

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Two addresses that stand for the same mailbox as far as this guard is concerned. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Is this address already somebody else's, inside this organization?
 *
 * `speaker_profile.email` is a matching key and not a display field: it is what
 * `upsertCoSpeaker` resolves a co-presenter against, and what
 * `unclaimedProfileForEmail` claims a profile by. That is what makes an address
 * typed into "About you" different from a name typed there.
 *
 * Compared case-insensitively, and this is the one place in the module that
 * deliberately disagrees with the rest of the code. Everything else here matches
 * addresses with `=`, so `Marcus@…` and `marcus@…` are two profiles — but this
 * function's whole job is to notice the person a human is describing, and humans
 * type capitals. Widening can only ever refuse *more*: it cannot match a row that
 * `=` would have missed and then act on it, because the only thing it does with a
 * match is say no.
 */
export async function emailHeldByAnother(
	tx: Reader,
	organizationId: string,
	email: string | null | undefined,
	ownProfileId: number | null
): Promise<boolean> {
	if (!email) return false;

	const rows = await tx
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, organizationId),
				sql`lower(${speakerProfileTable.email}) = lower(${email})`
			)
		)
		.limit(2);

	return rows.some((row) => row.id !== ownProfileId);
}

/**
 * "About you" is about you (#229).
 *
 * Your own address is always fine — that is how a profile an organizer put on
 * the roster before you signed up gets claimed. Any other address is fine too,
 * right up until it is somebody's: the form is then describing a different
 * person, and saving it would move their address onto your account rather than
 * record theirs.
 *
 * A field error rather than a silent drop, because the submitter has a
 * co-presenter field two sections down that does what they were reaching for,
 * and a refusal that does not name it just gets retyped.
 */
export async function refuseStatedAddress(
	userId: string,
	call: OpenCall,
	statedRaw: string
): Promise<SaveResult | null> {
	const stated = statedRaw.trim();
	if (!stated) return null;

	const [account] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (sameAddress(stated, account?.email)) return null;

	const [own] = await db
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, call.conference.organizationId),
				eq(speakerProfileTable.userId, userId)
			)
		)
		.limit(1);

	if (!(await emailHeldByAnother(db, call.conference.organizationId, stated, own?.id ?? null))) {
		return null;
	}

	return {
		ok: false,
		reason: 'invalid',
		errors: {
			speakerEmail:
				'That address already belongs to another speaker at this conference. ' +
				'If they are presenting with you, add them under co-presenters instead — ' +
				'this section is your own details.'
		},
		fieldErrors: {}
	};
}
