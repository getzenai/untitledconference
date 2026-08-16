import { describe, expect, it } from 'vitest';
import { browserDraftLeavePrompt, browserDraftStayHint } from './browser-draft-copy';

describe('browser draft copy', () => {
	it('names the field, where it lives, and when it dies, without calling it saved', () => {
		const rest =
			'will stay in this browser on this device. Another device, another profile, or clearing your browser data, and it is gone.';

		const notes = browserDraftStayHint('your notes');
		expect(notes).toBe(`Only your notes ${rest}`);
		expect(notes).not.toMatch(/saved/i);
		expect(notes).not.toMatch(/lose/i);
		expect(notes).not.toMatch(/cleared store/i);

		const leave = browserDraftLeavePrompt('your notes');
		expect(leave).toBe(`${notes} Leave this page?`);

		const proposal = browserDraftLeavePrompt('your proposal edit');
		expect(proposal).toBe(`Only your proposal edit ${rest} Leave this page?`);
		expect(proposal).not.toContain('your notes');

		const call = browserDraftStayHint('what you filled in on this call');
		expect(call).toBe(`Only what you filled in on this call ${rest}`);
		expect(call).not.toMatch(/saved/i);
	});
});
