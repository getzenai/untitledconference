import { loadSpeakerAppearances } from '$lib/server/conference/public-conference';
import type { PageServerLoad } from './$types';

/**
 * The one thing this page needs that the shared layout loader cannot give it.
 *
 * `+layout.server.ts` loads exactly one conference, on purpose — all five public
 * surfaces read the same object so they cannot disagree (EMB-16). But a speaker
 * profile is org-global and outlives any single event, and the whole point of the
 * profile page after the conference is the person's talks *across* years. That is
 * a second query, and it belongs here rather than in the layout so the four
 * surfaces that will never render it do not pay for it.
 *
 * Still no session check: this subtree is readable with no account at all.
 */
export const load: PageServerLoad = async ({ params, parent }) => {
	const { conference } = await parent();

	const speakerProfileId = Number(params.speakerId);
	const conferenceId = Number(conference.id);

	// The design fixture carries string ids ("spk-ada", "conf-untitled-2026") and
	// has no database rows behind it. Querying with NaN is not an error Postgres
	// reports, so the guard is here rather than in the query.
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) return { appearances: [] };

	return {
		appearances: await loadSpeakerAppearances(speakerProfileId, {
			excludeConferenceId: Number.isInteger(conferenceId) ? conferenceId : undefined
		})
	};
};
