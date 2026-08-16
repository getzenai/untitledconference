import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';
import { CONTACT_NOTES_LEAVE_PROMPT, contactNotesDraftScope } from './contact-notes-draft';

describe('contactNotesDraftScope', () => {
	it('keys the parked notes to this contact, not another', () => {
		expect(contactNotesDraftScope(7)).toBe('contact-notes:7');
		expect(contactNotesDraftScope(7)).not.toBe(contactNotesDraftScope(8));
	});
});

describe('CONTACT_NOTES_LEAVE_PROMPT', () => {
	it('names the notes, not the page, and is not a saved page', () => {
		expect(CONTACT_NOTES_LEAVE_PROMPT).toBe(browserDraftLeavePrompt('your notes'));
		expect(CONTACT_NOTES_LEAVE_PROMPT).toContain('your notes');
		expect(CONTACT_NOTES_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(CONTACT_NOTES_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
