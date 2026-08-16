import { browserDraftKey, writeBrowserDraft } from '$lib/forms/browser-draft';
import { describe, expect, it } from 'vitest';
import {
	NEW_SPEAKER_FIELDS,
	SPEAKER_ROW_FIELDS,
	SPEAKER_ROW_LEAVE_PROMPT,
	clearSpeakerRowDrafts,
	newSpeakerFieldScope,
	speakerFieldScope,
	speakerImportCsvScope,
	speakerNotesDraftScope,
	speakerRowDraftScopes
} from './speaker-notes-draft';

describe('speaker draft scopes', () => {
	it('keeps the notes key that #759 already parks', () => {
		expect(speakerNotesDraftScope('devflow', 5)).toBe('speaker-notes:devflow:5');
		expect(speakerFieldScope('devflow', 5, 'notes')).toBe(speakerNotesDraftScope('devflow', 5));
	});

	it('puts the field name before the conference and id, so new cannot collide', () => {
		expect(speakerFieldScope('devflow', 5, 'name')).toBe('speaker-name:devflow:5');
		expect(newSpeakerFieldScope('devflow', 'name')).toBe('speaker-new:devflow:name');
		expect(speakerImportCsvScope('devflow')).toBe('speaker-import-csv:devflow');
		expect(speakerImportCsvScope('devflow')).not.toBe(newSpeakerFieldScope('devflow', 'csv'));
		expect(NEW_SPEAKER_FIELDS).toEqual(['name', 'email', 'jobTitle', 'company', 'bio']);
		expect(SPEAKER_ROW_FIELDS).toEqual(['name', 'email', 'sortName', 'jobTitle', 'company', 'bio']);
		// A field called `new` would be `speaker-new:devflow:5`. The dialog key
		// puts the field after the slug. An id is a number, never `name`.
		expect(speakerFieldScope('devflow', 5, 'new')).not.toBe(
			newSpeakerFieldScope('devflow', 'name')
		);
		expect(speakerFieldScope('devflow', 5, 'new')).not.toBe(newSpeakerFieldScope('devflow', 'new'));
	});

	it('pins the production key the row and dialog will write', () => {
		expect(browserDraftKey(speakerFieldScope('devflow', 5, 'name'), 'ada')).toBe(
			`unsaved-form-draft:${encodeURIComponent('speaker-name:devflow:5')}:${encodeURIComponent('ada')}`
		);
		expect(browserDraftKey(newSpeakerFieldScope('devflow', 'name'), 'ada')).toBe(
			`unsaved-form-draft:${encodeURIComponent('speaker-new:devflow:name')}:${encodeURIComponent('ada')}`
		);
	});

	it('clears the typed row fields and the notes copy, and leaves other keys', () => {
		const storage = new Map<string, string>();
		const store = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			}
		};
		for (const scope of speakerRowDraftScopes('devflow', 5)) {
			writeBrowserDraft(store, { scope, owner: 'ada', baseline: '', value: 'typed' });
		}
		writeBrowserDraft(store, {
			scope: speakerFieldScope('devflow', 6, 'bio'),
			owner: 'ada',
			baseline: '',
			value: 'other speaker'
		});
		writeBrowserDraft(store, {
			scope: newSpeakerFieldScope('devflow', 'bio'),
			owner: 'ada',
			baseline: '',
			value: 'dialog'
		});

		clearSpeakerRowDrafts(store, 'devflow', 5, 'ada');

		expect(speakerRowDraftScopes('devflow', 5)).toContain('speaker-bio:devflow:5');
		expect(speakerRowDraftScopes('devflow', 5)).toContain('speaker-notes:devflow:5');
		for (const scope of speakerRowDraftScopes('devflow', 5)) {
			expect(store.getItem(browserDraftKey(scope, 'ada'))).toBeNull();
		}
		expect(
			store.getItem(browserDraftKey(speakerFieldScope('devflow', 6, 'bio'), 'ada'))
		).not.toBeNull();
		expect(
			store.getItem(browserDraftKey(newSpeakerFieldScope('devflow', 'bio'), 'ada'))
		).not.toBeNull();
	});

	it('asks to leave in the stay-hint shape, and does not say saved', () => {
		expect(SPEAKER_ROW_LEAVE_PROMPT).toMatch(/what you typed on this speaker will stay/i);
		expect(SPEAKER_ROW_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(SPEAKER_ROW_LEAVE_PROMPT).toMatch(/clearing your browser data/i);
		expect(SPEAKER_ROW_LEAVE_PROMPT).toMatch(/Leave this page\?/);
		expect(SPEAKER_ROW_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
