/**
 * Draft or live — the switch the whole public half of the product hangs on.
 *
 * The settings form used to write `conference.status` inline. Publishing is not
 * a column: `loadPublicConference`, `listPublishedConferences` and `openCall`
 * all filter on it, so a second writer that set the value a different way would
 * drift from what a visitor actually sees. One function, two callers — the
 * settings action and the MCP publish/unpublish tools.
 *
 * The caller sends the state it wants rather than "toggle": a stale tab (or a
 * retried tool call) would otherwise flip the conference the wrong way.
 *
 * Nothing gates publishing — no rooms, no days, no accepted talks. Publishing is
 * what opens the call for papers, so requiring a programme first would be the
 * wrong way round.
 */
import { db } from '$lib/server/db';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';

export type VisibilityTarget = Pick<Conference, 'id' | 'status'>;

export type VisibilityResult = {
	changed: boolean;
	status: 'draft' | 'published';
};

export async function setConferenceVisibility(
	conference: VisibilityTarget,
	published: boolean
): Promise<VisibilityResult> {
	const next = published ? 'published' : 'draft';
	if (conference.status === next) return { changed: false, status: next };

	await db
		.update(conferenceTable)
		.set({ status: next })
		.where(eq(conferenceTable.id, conference.id));

	return { changed: true, status: next };
}
