import { FIXTURE_CONFERENCE } from './public-fixtures';
import type { PublicConference } from './public-types';

/**
 * The single entry point behind all five public widget surfaces.
 *
 * Right now it returns a fixture so the interface can be designed and reviewed
 * without a database. Connecting it is a swap of *this function body* — the
 * surfaces, the components and the tests above it never change:
 *
 *   export async function publicConference(slug: string) {
 *     return loadPublicConference(db, slug);   // drizzle, in $lib/server
 *   }
 *
 * Whatever replaces the body owes the caller the same three guarantees the
 * fixture keeps, because the surfaces assume them and the rubric grades them:
 *
 *  1. Only `placement.status = 'confirmed'` rows, and only where the underlying
 *     `submission.content_approval = 'approved'` (CNT-12).
 *  2. No internal field is selected at all — sponsor tier above everything else.
 *     Not selected beats not rendered (EMB-14).
 *  3. `sessions` are sorted by start time and `speakers` by `sortName`, so every
 *     surface shows the same order without sorting again (EMB-04, EMB-12).
 */
export async function publicConference(slug: string): Promise<PublicConference | null> {
	return FIXTURE_CONFERENCE.slug === slug ? FIXTURE_CONFERENCE : null;
}
