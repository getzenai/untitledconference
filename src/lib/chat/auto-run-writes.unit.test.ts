import { describe, expect, it } from 'vitest';
import { ASSISTANT_AUTO_RUN_WRITES, assistantWriteRefreshesPage } from './auto-run-writes';

describe('assistantWriteRefreshesPage', () => {
	it('refreshes after a card, even for a name the auto-run set has never seen', () => {
		expect(assistantWriteRefreshesPage('decide_submissions', true)).toBe(true);
		expect(assistantWriteRefreshesPage('brand_new_write_tool', true)).toBe(true);
	});

	it('refreshes an auto-run write that never showed a card', () => {
		expect(assistantWriteRefreshesPage('update_conference', false)).toBe(true);
		expect(assistantWriteRefreshesPage('move_talk', false)).toBe(true);
	});

	it('does not refresh a read, or a gated write that has not been approved', () => {
		expect(assistantWriteRefreshesPage('get_agenda', false)).toBe(false);
		expect(assistantWriteRefreshesPage('list_my_review_assignments', false)).toBe(false);
		expect(assistantWriteRefreshesPage('decide_submissions', false)).toBe(false);
	});

	it('keeps every listed auto-run name on the no-card path', () => {
		for (const name of ASSISTANT_AUTO_RUN_WRITES) {
			expect(assistantWriteRefreshesPage(name, false)).toBe(true);
		}
	});
});
