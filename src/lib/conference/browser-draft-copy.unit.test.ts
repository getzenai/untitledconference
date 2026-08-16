import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt } from './browser-draft-copy';

describe('browserDraftLeavePrompt', () => {
	it('names the field, where it lives, and when it dies, without calling it saved', () => {
		const rest =
			'will stay in this browser on this device. Another device, another profile, or clearing your browser data, and it is gone. Leave this page?';

		const notes = browserDraftLeavePrompt('your notes');
		expect(notes).toBe(`Only your notes ${rest}`);
		expect(notes).not.toMatch(/saved/i);
		expect(notes).not.toMatch(/lose/i);
		expect(notes).not.toMatch(/cleared store/i);

		const proposal = browserDraftLeavePrompt('your proposal edit');
		expect(proposal).toBe(`Only your proposal edit ${rest}`);
		expect(proposal).not.toContain('your notes');
	});
});
