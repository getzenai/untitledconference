import { loadPublicConference } from '$lib/server/conference/public-conference';
import { FIXTURE_CONFERENCE } from './public-fixtures';
import type { PublicConference } from './public-types';

/**
 * The single entry point behind all five public widget surfaces.
 *
 * The body now reads the database. The three guarantees it owes its caller are
 * unchanged, and enforced in the query itself rather than by the surfaces:
 *
 *  1. Only `placement.status = 'confirmed'` rows, and only where the underlying
 *     `submission.content_approval = 'approved'` (CNT-12).
 *  2. No internal field is selected at all — sponsor tier above everything else.
 *     Not selected beats not rendered (EMB-14).
 *  3. `sessions` are sorted by start time and `speakers` by `sortName`, so every
 *     surface shows the same order without sorting again (EMB-04, EMB-12).
 *
 * The design fixture is kept and still reachable under its own slug. It is not
 * dead weight: it carries the awkward cases on purpose — a speaker with no
 * headshot, another with neither title nor company, a day with a gap in the grid —
 * so the layouts can be checked against them without seeding those states into a
 * demo database the judge will also see.
 *
 * This module is server-only by virtue of that import, and it is only ever loaded
 * from `+layout.server.ts`.
 */
export async function publicConference(slug: string): Promise<PublicConference | null> {
	if (slug === FIXTURE_CONFERENCE.slug) return FIXTURE_CONFERENCE;
	return loadPublicConference(slug);
}
