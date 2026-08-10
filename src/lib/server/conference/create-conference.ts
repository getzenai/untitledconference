/**
 * Starting a conference.
 *
 * The one path a new organizer has to get through: an account with an
 * organization but nothing in it, out the other side into `/manage/<slug>`.
 * Deliberately four fields — name, slug, and the two dates. Everything else a
 * conference carries already has a settings screen, and a wizard that asks for
 * all of it up front is a wall in front of the only step that matters.
 *
 * Creation is org-wide, not per-conference: a scoped `organizer` membership is
 * granted *on* an existing conference, so it cannot be the right to make a new
 * one. Only Better Auth's `owner` and `admin` seats can, which is the same rule
 * `access.ts` uses for org-wide organizer rights.
 */
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '$lib/conference/slug';
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

/** Better Auth's org-wide roles that may start a conference. Mirrors `access.ts`. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

export type ConferenceDraft = {
	name: string;
	slug: string;
	startsOn: string | null;
	endsOn: string | null;
};

export type CreateConferenceResult =
	| { ok: true; conference: Conference }
	| {
			ok: false;
			reason: 'no_organization' | 'slug_taken' | 'invalid';
			field?: keyof ConferenceDraft;
	  };

const MAX_NAME = 120;

/**
 * The organization this user may create a conference in, or null.
 *
 * Filters to the org-wide seats *before* picking the oldest. Taking the oldest
 * seat and then checking its role would refuse someone who joined a colleague's
 * organization as a plain member last year and owns their own since Tuesday.
 * Same ordering as the session's organization pick, so the two agree.
 */
export async function organizationForNewConference(userId: string): Promise<string | null> {
	const [seat] = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(and(eq(member.userId, userId), inArray(member.role, ORG_WIDE_ORGANIZER_ROLES)))
		.orderBy(asc(member.createdAt), asc(member.id))
		.limit(1);

	return seat?.organizationId ?? null;
}

export function validateDraft(draft: ConferenceDraft): CreateConferenceResult | null {
	if (!draft.name.trim() || draft.name.length > MAX_NAME) {
		return { ok: false, reason: 'invalid', field: 'name' };
	}
	if (!SLUG_PATTERN.test(draft.slug) || draft.slug.length > MAX_SLUG_LENGTH) {
		return { ok: false, reason: 'invalid', field: 'slug' };
	}
	// Both dates are optional, but a conference that ends before it starts is a
	// typo the organizer should see now rather than on the public page.
	if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) {
		return { ok: false, reason: 'invalid', field: 'endsOn' };
	}
	return null;
}

/** Postgres 23505 on `conference_slug_unique`, as Drizzle wraps it. */
function isSlugCollision(cause: unknown): boolean {
	const driver = (cause as { cause?: { code?: string; constraint_name?: string } })?.cause;
	return driver?.code === '23505' && driver?.constraint_name === 'conference_slug_unique';
}

export async function createConference(
	userId: string,
	draft: ConferenceDraft
): Promise<CreateConferenceResult> {
	const invalid = validateDraft(draft);
	if (invalid) return invalid;

	const organizationId = await organizationForNewConference(userId);
	if (!organizationId) return { ok: false, reason: 'no_organization' };

	try {
		const [conference] = await db
			.insert(conferenceTable)
			.values({
				organizationId,
				name: draft.name.trim(),
				slug: draft.slug,
				startsOn: draft.startsOn,
				endsOn: draft.endsOn
			})
			.returning();

		return { ok: true, conference };
	} catch (cause) {
		// The unique index is the arbiter, not a check-then-insert: two organizers
		// picking the same slug in the same second would both pass a prior lookup.
		if (isSlugCollision(cause)) return { ok: false, reason: 'slug_taken', field: 'slug' };
		throw cause;
	}
}
