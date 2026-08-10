/**
 * Where an uploaded deliverable's bytes live.
 *
 * The bucket has no public URL and no custom domain. Files come back out
 * through an authenticated route that re-checks ownership, because a slide deck
 * a speaker has not released is not public data — and a bucket URL is a password
 * that never expires and cannot be revoked.
 *
 * Keys are `conference/<id>/task/<id>/v<version>/<nonce>/<filename>` — readable
 * in a bucket listing, and carrying enough to trace a stray object back to its
 * row. They are NOT a capability: knowing the key gets you nothing without the
 * session that owns it.
 *
 * The nonce is the one part that is not descriptive, and it is there for a race.
 * Two uploads to the same task in the same moment read the same `max(version)`,
 * so without it they compute the same key: the loser's `put` can overwrite the
 * winner's object before its own insert hits `deliverable_version_unique` and
 * returns 409, leaving the surviving row pointing at somebody else's bytes. The
 * bucket write has to happen before the row — a row pointing at an object that
 * was never written is a broken download with no way to tell from outside — so
 * the collision is avoided rather than detected. With the nonce the loser's
 * bytes land where nothing reads them and the 409 stays the only visible
 * outcome.
 *
 * The limits and the allowlist live in `$lib/conference/upload-limits`, because
 * the form needs to state them before a file is chosen.
 */

/** Strips anything that could make a key mean something other than a name. */
export function safeFilename(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? 'file';
	const cleaned = base
		.replace(/[^\w. -]/g, '_')
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned.slice(0, 120) || 'file';
}

/** Six hex characters — enough that two puts in one second do not meet. */
function nonce(): string {
	return crypto.randomUUID().slice(0, 6);
}

export function objectKey(
	conferenceId: number,
	taskId: number,
	version: number,
	filename: string
): string {
	return `conference/${conferenceId}/task/${taskId}/v${version}/${nonce()}/${safeFilename(filename)}`;
}

/** The bucket, or null where none is bound — local `vite dev` and tests. */
export function uploadsBucket(platform: App.Platform | undefined) {
	return platform?.env?.UPLOADS ?? null;
}
