/** Scope for the speaker-row internal notes safety copy (#759). */
export function speakerNotesDraftScope(slug: string, speakerProfileId: number): string {
	return `speaker-notes:${slug}:${speakerProfileId}`;
}
