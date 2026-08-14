/**
 * Which kinds of leaving cost a question (#435).
 *
 * The guard is worth nothing if it fires on the form's own submit — the
 * organizer would be asked whether they want to lose the work they just sent.
 * That case, and the reload the page cannot draw a dialog for, are the two the
 * table below exists for.
 */
import { describe, expect, it } from 'vitest';
import { leaveDecision, UNSAVED_PROMPT } from './unsaved-work';

describe('leaving a form with unsaved input', () => {
	it('lets every navigation through while nothing has been typed', () => {
		for (const type of ['link', 'goto', 'popstate', 'leave', 'form'] as const) {
			expect(leaveDecision(false, type)).toBe('allow');
		}
	});

	it('asks before an in-app navigation throws typed input away', () => {
		expect(leaveDecision(true, 'link')).toBe('ask');
		expect(leaveDecision(true, 'goto')).toBe('ask');
		expect(leaveDecision(true, 'popstate')).toBe('ask');
	});

	it('never blocks the form posting its own work', () => {
		expect(leaveDecision(true, 'form')).toBe('allow');
	});

	it('hands a reload or a closed tab to the browser', () => {
		expect(leaveDecision(true, 'leave')).toBe('defer');
	});

	it('names the loss rather than asking "are you sure"', () => {
		expect(UNSAVED_PROMPT).toMatch(/not been saved/);
		expect(UNSAVED_PROMPT).toMatch(/lose it/);
	});
});
