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
import { and, eq, ne } from 'drizzle-orm';

export type VisibilityTarget = Pick<Conference, 'id' | 'status'>;

export type VisibilityResult =
	| { changed: boolean; status: 'draft' | 'published' }
	| { changed: false; status: 'archived' };

/**
 * An archived conference is not published or unpublished — it is restored.
 *
 * Without this, publishing would be a second way out of the archive, and one that
 * skips the only step that knows where the conference came from: it would clear
 * `status` while leaving `statusBeforeArchive` set, so a later restore would read
 * a stale answer. `restoreConference` is the one door back.
 */
export async function setConferenceVisibility(
	conference: VisibilityTarget,
	published: boolean
): Promise<VisibilityResult> {
	if (conference.status === 'archived') return { changed: false, status: 'archived' };

	const next = published ? 'published' : 'draft';
	if (conference.status === next) return { changed: false, status: next };

	const [updated] = await db
		.update(conferenceTable)
		.set({ status: next })
		// Re-checked here rather than trusted from the row above: between the read and
		// this write the conference can be archived, and a publish that lands after
		// that would put a "deleted" event back on the internet with nobody asking.
		.where(and(eq(conferenceTable.id, conference.id), ne(conferenceTable.status, 'archived')))
		.returning({ id: conferenceTable.id });

	if (!updated) return { changed: false, status: 'archived' };

	return { changed: true, status: next };
}
