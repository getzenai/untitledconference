import { describe, expect, it } from 'vitest';
import { contactNotesDraftScope } from './contact-notes-draft';

describe('contactNotesDraftScope', () => {
	it('keys the parked notes to this contact, not another', () => {
		expect(contactNotesDraftScope(7)).toBe('contact-notes:7');
		expect(contactNotesDraftScope(7)).not.toBe(contactNotesDraftScope(8));
	});
});
