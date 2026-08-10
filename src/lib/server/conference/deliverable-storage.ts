/**
 * Where an uploaded deliverable's bytes live.
 *
 * The bucket has no public URL and no custom domain. Files come back out
 * through an authenticated route that re-checks ownership, because a slide deck
 * a speaker has not released is not public data — and a bucket URL is a password
 * that never expires and cannot be revoked.
 *
 * Keys are `conference/<id>/task/<id>/v<version>/<filename>` — readable in a
 * bucket listing, and carrying enough to trace a stray object back to its row.
 * They are NOT a capability: knowing the key gets you nothing without the
 * session that owns it.
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

export function objectKey(
	conferenceId: number,
	taskId: number,
	version: number,
	filename: string
): string {
	return `conference/${conferenceId}/task/${taskId}/v${version}/${safeFilename(filename)}`;
}

/** The bucket, or null where none is bound — local `vite dev` and tests. */
export function uploadsBucket(platform: App.Platform | undefined) {
	return platform?.env?.UPLOADS ?? null;
}
