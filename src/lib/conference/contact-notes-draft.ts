import { BROWSER_DRAFT_LEAVE_PROMPT } from './browser-draft-copy';

/** Scope for the contact-page internal notes safety copy (#765). */
export function contactNotesDraftScope(contactId: number): string {
	return `contact-notes:${contactId}`;
}

/**
 * Same sentence as the other parked drafts (#787). "Only this text" is what
 * `dirty` tracks on a page of seven fields that are not parked.
 */
export const CONTACT_NOTES_LEAVE_PROMPT = BROWSER_DRAFT_LEAVE_PROMPT;
