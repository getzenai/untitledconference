/** Scope for the contact-page internal notes safety copy (#765). */
export function contactNotesDraftScope(contactId: number): string {
	return `contact-notes:${contactId}`;
}

/**
 * Leave prompt for the one parked field on a page of seven that are not (#788).
 * Names what `dirty` tracks. Does not say the page is saved.
 */
export const CONTACT_NOTES_LEAVE_PROMPT = 'Only these notes stay in this browser. Leave this page?';
