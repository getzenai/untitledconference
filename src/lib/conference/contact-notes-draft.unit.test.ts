import { describe, expect, it } from 'vitest';
import { BROWSER_DRAFT_LEAVE_PROMPT } from './browser-draft-copy';
import { CONTACT_NOTES_LEAVE_PROMPT, contactNotesDraftScope } from './contact-notes-draft';

describe('contactNotesDraftScope', () => {
	it('keys the parked notes to this contact, not another', () => {
		expect(contactNotesDraftScope(7)).toBe('contact-notes:7');
		expect(contactNotesDraftScope(7)).not.toBe(contactNotesDraftScope(8));
	});
});

describe('CONTACT_NOTES_LEAVE_PROMPT', () => {
	it('is the shared draft sentence, not a saved page', () => {
		expect(CONTACT_NOTES_LEAVE_PROMPT).toBe(BROWSER_DRAFT_LEAVE_PROMPT);
		expect(CONTACT_NOTES_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
