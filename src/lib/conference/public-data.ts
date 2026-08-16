import {
	listDirectoryConferences,
	loadPublicConference,
	type PublicConferenceSummary
} from '$lib/server/conference/public-conference';
import { FIXTURE_CONFERENCE } from './public-fixtures';
import type { PublicConference } from './public-types';
import { watchableRecordingUrl } from './public-view';

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
	if (slug === FIXTURE_CONFERENCE.slug) return watchableFixture();
	return loadPublicConference(slug);
}

/**
 * The fixture answers the recording question for itself.
 *
 * The database path applies the rule where it assembles the payload (#807), and
 * the fixture never goes through it — so without this the one recorded talk in
 * it would offer "Watch recording" for a September 2026 session that has not
 * happened, which is the bug this rule exists to prevent (#794). The literal is
 * static; whether it is over is not, so it is decided per request here rather
 * than written into the fixture.
 */
function watchableFixture(): PublicConference {
	return {
		...FIXTURE_CONFERENCE,
		sessions: FIXTURE_CONFERENCE.sessions.map((session) => ({
			...session,
			recordingUrl: watchableRecordingUrl(session)
		}))
	};
}

export type { PublicConferenceSummary };

/**
 * The published conferences the front door lists.
 *
 * The design fixture is deliberately *not* in here, and that is the one rule this
 * function has beyond the query. It stays reachable at `/c/untitled-2026` for
 * checking layouts against its awkward cases, but a made-up conference on the
 * public index would be indistinguishable from a real one to anybody arriving at
 * the base URL — including a judge.
 *
 * Each row carries `call` from the same published-form + `callWindow` path the
 * public CFP page uses for its 404, so the listing can mark an open call
 * without comparing dates in the template (#709).
 */
export async function publicConferenceDirectory(): Promise<PublicConferenceSummary[]> {
	return listDirectoryConferences();
}
