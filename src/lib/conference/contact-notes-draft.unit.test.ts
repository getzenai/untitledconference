import { describe, expect, it } from 'vitest';
import { CONTACT_NOTES_LEAVE_PROMPT, contactNotesDraftScope } from './contact-notes-draft';

describe('contactNotesDraftScope', () => {
	it('keys the parked notes to this contact, not another', () => {
		expect(contactNotesDraftScope(7)).toBe('contact-notes:7');
		expect(contactNotesDraftScope(7)).not.toBe(contactNotesDraftScope(8));
	});
});

describe('CONTACT_NOTES_LEAVE_PROMPT', () => {
	it('names the parked notes, not a saved page', () => {
		expect(CONTACT_NOTES_LEAVE_PROMPT).toMatch(/only these notes stay in this browser/i);
		expect(CONTACT_NOTES_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
