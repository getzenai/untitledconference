import { browserDraftLeavePrompt } from './browser-draft-copy';

/** Scope for one parked field on the contact profile (#765, #789). */
export function contactFieldScope(contactId: number, field: string): string {
	return `contact-${field}:${contactId}`;
}

/** Fields on the add-contact dialog. One thought, five keys (#763). */
export const NEW_CONTACT_FIELDS = ['name', 'email', 'company', 'jobTitle', 'tags'] as const;

/** Scope for one parked field on the add-contact dialog. No contact id yet. */
export function newContactFieldScope(field: string): string {
	return `contact-new:${field}`;
}

/** Paste box on the contacts import dialog. Not the roster import. */
export function contactImportCsvScope(organizationId: string): string {
	return `contact-import-csv:${organizationId}`;
}

/** Scope for the contact-page internal notes safety copy (#765). */
export function contactNotesDraftScope(contactId: number): string {
	return contactFieldScope(contactId, 'notes');
}

/**
 * Leave prompt for the whole profile (#789). Names what `dirty` tracks.
 * Does not say the page is saved.
 */
export const CONTACT_PROFILE_LEAVE_PROMPT = browserDraftLeavePrompt(
	'what you typed on this profile'
);
