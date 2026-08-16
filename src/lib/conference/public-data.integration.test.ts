/**
 * The entry point behind the public surfaces answers the recording question for
 * *both* the database and the design fixture (#807).
 *
 * The fixture never goes through `loadPublicConference`, so gating the query
 * alone left it out — and it carries one recorded talk, dated after this was
 * written. The rule used to reach it by accident, because every surface asked
 * the clock itself; once the decision moved to the server the fixture had to be
 * given the same answer deliberately.
 *
 * The assertion is the invariant rather than the fixture's dates, so it cannot
 * expire: a session may only offer a recording once it is over. That stays true
 * after September 2026, when the fixture becomes a past conference and the same
 * talk correctly starts showing its link.
 */
import { describe, expect, it } from 'vitest';
import { publicConference } from './public-data';
import { FIXTURE_CONFERENCE } from './public-fixtures';

describe('publicConference', () => {
	it('offers a recording only for a talk that is over — fixture included', async () => {
		const conference = await publicConference(FIXTURE_CONFERENCE.slug);
		expect(conference).not.toBeNull();

		const offered = conference!.sessions.filter((session) => session.recordingUrl);
		for (const session of offered) {
			expect(new Date(session.endsAt).getTime(), session.title).toBeLessThanOrEqual(Date.now());
		}

		// The fixture really does carry one, so "none offered" is not a free pass:
		// it means the rule withheld it, not that there was nothing to withhold.
		expect(FIXTURE_CONFERENCE.sessions.some((session) => session.recordingUrl)).toBe(true);
	});
});
