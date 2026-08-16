/** The sentences someone reads before deleting a CFP draft (#742). */
import { describe, expect, it } from 'vitest';
import { draftDeleteWarning } from './draft-delete-warning';

describe('draftDeleteWarning', () => {
	it('tells the author the row is gone, and that there is no undo', () => {
		const warning = draftDeleteWarning('author');
		expect(warning.title).toBe('Delete this draft?');
		expect(warning.consequence).toContain('gone from your proposals');
		expect(warning.consequence).toContain('no undo');
		expect(warning.reversal).toContain('start a new proposal');
	});

	it('tells the organizer the speaker never handed it in', () => {
		const warning = draftDeleteWarning('organizer');
		expect(warning.title).toBe('Delete this draft?');
		expect(warning.consequence).toContain('has not submitted it');
		expect(warning.consequence).toContain('no undo');
		expect(warning.reversal).toContain('start again');
	});
});
