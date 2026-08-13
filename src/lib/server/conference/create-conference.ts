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
import { invalidRangeField } from '$lib/conference/conference-dates';
import { hasSlugShape, isReservedSlug } from '$lib/conference/slug';
import { syncConferenceDays } from '$lib/server/conference/conference-days';
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
	/** Optional — the new-conference form does not ask; the MCP tool can. */
	venue?: string | null;
};

export type CreateConferenceResult =
	| { ok: true; conference: Conference }
	| {
			ok: false;
			reason: 'no_organization' | 'slug_taken' | 'slug_reserved' | 'invalid';
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
	if (!hasSlugShape(draft.slug)) {
		return { ok: false, reason: 'invalid', field: 'slug' };
	}
	// Its own reason, not `invalid`: the address is spelled correctly and the
	// organizer still cannot have it, which is the same shape of answer as
	// `slug_taken` rather than a spelling complaint.
	if (isReservedSlug(draft.slug)) {
		return { ok: false, reason: 'slug_reserved', field: 'slug' };
	}

	const badDate = invalidRangeField(draft.startsOn, draft.endsOn);
	if (badDate) return { ok: false, reason: 'invalid', field: badDate };

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
		// Conference and days in one transaction: a conference that exists without
		// its days is exactly the state #86 is about, and a half-written creation
		// would put a fresh one straight back into it.
		const conference = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(conferenceTable)
				.values({
					organizationId,
					name: draft.name.trim(),
					slug: draft.slug,
					startsOn: draft.startsOn,
					endsOn: draft.endsOn,
					venue: draft.venue?.trim() || null
				})
				.returning();

			await syncConferenceDays(created.id, created.startsOn, created.endsOn, tx);

			return created;
		});

		return { ok: true, conference };
	} catch (cause) {
		// The unique index is the arbiter, not a check-then-insert: two organizers
		// picking the same slug in the same second would both pass a prior lookup.
		if (isSlugCollision(cause)) return { ok: false, reason: 'slug_taken', field: 'slug' };
		throw cause;
	}
}
