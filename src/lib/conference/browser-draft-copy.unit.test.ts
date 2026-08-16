import { describe, expect, it } from 'vitest';
import { BROWSER_DRAFT_LEAVE_PROMPT } from './browser-draft-copy';

describe('BROWSER_DRAFT_LEAVE_PROMPT', () => {
	it('names where the text lives and when it dies, without calling it saved', () => {
		expect(BROWSER_DRAFT_LEAVE_PROMPT).toMatch(/this browser on this device/i);
		expect(BROWSER_DRAFT_LEAVE_PROMPT).toMatch(/another device/i);
		expect(BROWSER_DRAFT_LEAVE_PROMPT).toMatch(/cleared store/i);
		expect(BROWSER_DRAFT_LEAVE_PROMPT).not.toMatch(/saved/i);
		expect(BROWSER_DRAFT_LEAVE_PROMPT).not.toMatch(/lose/i);
	});
});
