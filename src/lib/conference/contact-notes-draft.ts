/** Scope for the contact-page internal notes safety copy (#765). */
export function contactNotesDraftScope(contactId: number): string {
	return `contact-notes:${contactId}`;
}
