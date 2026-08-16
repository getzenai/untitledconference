import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';

describe('browserDraftLeavePrompt', () => {
	it('names the field, where it lives, and when it dies, without calling it saved', () => {
		const notes = browserDraftLeavePrompt('your notes');
		expect(notes).toContain('your notes');
		expect(notes).toMatch(/this browser on this device/i);
		expect(notes).toMatch(/another device/i);
		expect(notes).toMatch(/clearing your browser data/i);
		expect(notes).not.toMatch(/saved/i);
		expect(notes).not.toMatch(/lose/i);
		expect(notes).not.toMatch(/cleared store/i);

		const proposal = browserDraftLeavePrompt('your proposal edit');
		expect(proposal).toContain('your proposal edit');
		expect(proposal).not.toContain('your notes');
		expect(proposal).toMatch(/this browser on this device/i);
		expect(proposal).toMatch(/clearing your browser data/i);
	});
});
