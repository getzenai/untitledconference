import { browserDraftKey } from '$lib/forms/browser-draft';
import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';
import {
	CONTACT_PROFILE_LEAVE_PROMPT,
	NEW_CONTACT_FIELDS,
	contactFieldScope,
	contactNotesDraftScope,
	newContactFieldScope
} from './contact-notes-draft';

describe('contactFieldScope', () => {
	it('keys each field to this contact, not another', () => {
		expect(contactFieldScope(7, 'bio')).toBe('contact-bio:7');
		expect(contactNotesDraftScope(7)).toBe('contact-notes:7');
		expect(contactNotesDraftScope(7)).toBe(contactFieldScope(7, 'notes'));
		expect(contactFieldScope(7, 'bio')).not.toBe(contactFieldScope(8, 'bio'));
	});
});

describe('newContactFieldScope', () => {
	it('lives in the shared helper, not a private prefix', () => {
		expect(NEW_CONTACT_FIELDS).toEqual(['name', 'email', 'company', 'jobTitle', 'tags']);
		expect(newContactFieldScope('name')).toBe('contact-new:name');
		expect(newContactFieldScope('name')).not.toBe(contactFieldScope(7, 'name'));
		expect(browserDraftKey(newContactFieldScope('name'), 'ada')).toBe(
			`unsaved-form-draft:${encodeURIComponent('contact-new:name')}:${encodeURIComponent('ada')}`
		);
	});
});

describe('CONTACT_PROFILE_LEAVE_PROMPT', () => {
	it('names the typed profile, not one field, and is not a saved page', () => {
		expect(CONTACT_PROFILE_LEAVE_PROMPT).toBe(
			browserDraftLeavePrompt('what you typed on this profile')
		);
		expect(CONTACT_PROFILE_LEAVE_PROMPT).toContain('what you typed on this profile');
		expect(CONTACT_PROFILE_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(CONTACT_PROFILE_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
