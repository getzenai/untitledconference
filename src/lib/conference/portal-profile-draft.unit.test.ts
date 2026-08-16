import { browserDraftKey } from '$lib/forms/browser-draft';
import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';
import { contactFieldScope } from './contact-notes-draft';
import {
	PORTAL_PROFILE_FIELDS,
	PORTAL_PROFILE_LEAVE_PROMPT,
	PORTAL_PROFILE_LINK_FIELDS,
	portalProfileDraftScopes,
	portalProfileFieldScope
} from './portal-profile-draft';
import { SPEAKER_LINK_ROWS } from './speaker-links';
import { speakerFieldScope } from './speaker-notes-draft';

describe('portalProfileFieldScope', () => {
	it('keys each field to this profile, not another, and not the roster or a contact', () => {
		expect(portalProfileFieldScope(7, 'name')).toBe('portal-name:7');
		expect(portalProfileFieldScope(7, 'bio')).toBe('portal-bio:7');
		expect(portalProfileFieldScope(7, 'linkUrl0')).toBe('portal-linkUrl0:7');
		expect(portalProfileFieldScope(7, 'name')).not.toBe(portalProfileFieldScope(8, 'name'));
		expect(portalProfileFieldScope(7, 'name')).not.toBe(speakerFieldScope('devflow', 7, 'name'));
		expect(portalProfileFieldScope(7, 'name')).not.toBe(contactFieldScope(7, 'name'));
		expect(portalProfileFieldScope(7, 'name')).not.toMatch(/^speaker-/);
		expect(portalProfileFieldScope(7, 'name')).not.toMatch(/^contact-/);
	});

	it('pins the production key the page will write', () => {
		expect(browserDraftKey(portalProfileFieldScope(7, 'name'), 'ada')).toBe(
			`unsaved-form-draft:${encodeURIComponent('portal-name:7')}:${encodeURIComponent('ada')}`
		);
	});

	it('covers every text field and every link row the form draws', () => {
		expect(PORTAL_PROFILE_FIELDS).toContain('name');
		expect(PORTAL_PROFILE_FIELDS).toContain('sortName');
		expect(PORTAL_PROFILE_FIELDS).toContain('jobTitle');
		expect(PORTAL_PROFILE_FIELDS).toContain('company');
		expect(PORTAL_PROFILE_FIELDS).toContain('bio');
		expect(PORTAL_PROFILE_LINK_FIELDS).toHaveLength(SPEAKER_LINK_ROWS * 2);
		expect(PORTAL_PROFILE_FIELDS).toContain('linkLabel2');
		expect(PORTAL_PROFILE_FIELDS).toContain('linkUrl2');
		expect(PORTAL_PROFILE_FIELDS).not.toContain('email');
		expect(PORTAL_PROFILE_FIELDS).not.toContain('headshot');

		const seven = portalProfileDraftScopes(7);
		const eight = portalProfileDraftScopes(8);
		expect(seven).toHaveLength(PORTAL_PROFILE_FIELDS.length);
		expect(new Set([...seven, ...eight]).size).toBe(seven.length + eight.length);
	});
});

describe('PORTAL_PROFILE_LEAVE_PROMPT', () => {
	it('names the typed profile, not one field, and is not a saved page', () => {
		expect(PORTAL_PROFILE_LEAVE_PROMPT).toBe(
			browserDraftLeavePrompt('what you typed on this profile')
		);
		expect(PORTAL_PROFILE_LEAVE_PROMPT).toContain('what you typed on this profile');
		expect(PORTAL_PROFILE_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(PORTAL_PROFILE_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
