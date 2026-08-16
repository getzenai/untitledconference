import { browserDraftKey } from '$lib/forms/browser-draft';
import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';
import { contactFieldScope } from './contact-notes-draft';
import { PORTAL_TASK_COMMENT_LEAVE_PROMPT, portalTaskCommentScope } from './portal-task-draft';
import { speakerFieldScope } from './speaker-notes-draft';

describe('portalTaskCommentScope', () => {
	it('scopes one comment box to its task and its file', () => {
		expect(portalTaskCommentScope(21, 4)).toBe('portal-task-comment:21:4');
		expect(portalTaskCommentScope(21, 4)).not.toBe(portalTaskCommentScope(21, 8));
		expect(portalTaskCommentScope(21, 4)).not.toBe(portalTaskCommentScope(22, 4));
		expect(portalTaskCommentScope(21, 4)).not.toBe(speakerFieldScope('devflow', 21, 'notes'));
		expect(portalTaskCommentScope(21, 4)).not.toBe(contactFieldScope(4, 'notes'));
		expect(portalTaskCommentScope(21, 4)).not.toMatch(/^speaker-/);
		expect(portalTaskCommentScope(21, 4)).not.toMatch(/^contact-/);
	});

	it('pins the production key the page will write', () => {
		expect(browserDraftKey(portalTaskCommentScope(21, 4), 'ada')).toBe(
			`unsaved-form-draft:${encodeURIComponent('portal-task-comment:21:4')}:${encodeURIComponent('ada')}`
		);
	});
});

describe('PORTAL_TASK_COMMENT_LEAVE_PROMPT', () => {
	it('names the typed question, not the file picker, and is not a saved page', () => {
		expect(PORTAL_TASK_COMMENT_LEAVE_PROMPT).toBe(
			browserDraftLeavePrompt('what you typed to the programme team')
		);
		expect(PORTAL_TASK_COMMENT_LEAVE_PROMPT).toContain('what you typed to the programme team');
		expect(PORTAL_TASK_COMMENT_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(PORTAL_TASK_COMMENT_LEAVE_PROMPT).not.toMatch(/saved/i);
	});
});
