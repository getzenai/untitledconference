/**
 * What counts as a photograph the speaker put there, versus a stand-in.
 *
 * Demo speakers are seeded with `/speakers/*.svg` placeholders that draw the
 * same initials the no-photo fallback does (#618). A real upload lands at
 * `/speaker-photo/<id>` — see `headshotHref`. Offering "Remove headshot" next
 * to the stand-in is offering to delete something that looks like nothing.
 */
export function isUploadedHeadshot(url: string | null | undefined): boolean {
	return Boolean(url?.startsWith('/speaker-photo/'));
}
