import { isTaskOverdue, taskDueDate } from '$lib/conference/task-due';
import { describe, expect, it } from 'vitest';

describe('taskDueDate', () => {
	const accepted = new Date('2026-08-17T00:20:00.000Z');

	it('keeps an absolute date and ignores the offset', () => {
		const fixed = new Date('2028-05-01T12:00:00.000Z');
		expect(taskDueDate(fixed, 0, accepted)).toBe(fixed);
	});

	it('has no deadline when neither field is set', () => {
		expect(taskDueDate(null, null, accepted)).toBeNull();
	});

	/**
	 * #865: offset 0 is "due the day they are accepted", not the accept
	 * millisecond. Revert the end-of-day branch and this is overdue 1ms later.
	 */
	it('puts offset 0 at the end of the acceptance day, not on the accept instant', () => {
		const due = taskDueDate(null, 0, accepted);
		expect(due?.toISOString()).toBe('2026-08-17T23:59:59.999Z');
		expect(isTaskOverdue(due, new Date(accepted.getTime() + 1))).toBe(false);
		expect(isTaskOverdue(due, new Date('2026-08-17T23:59:59.998Z'))).toBe(false);
		expect(isTaskOverdue(due, new Date('2026-08-18T00:00:00.000Z'))).toBe(true);
	});

	it('leaves a multi-day offset on the accept instant plus that many days', () => {
		expect(taskDueDate(null, 7, accepted)?.getTime()).toBe(
			accepted.getTime() + 7 * 24 * 60 * 60 * 1000
		);
		expect(taskDueDate(null, 14, accepted)?.getTime()).toBe(
			accepted.getTime() + 14 * 24 * 60 * 60 * 1000
		);
	});
});

describe('isTaskOverdue', () => {
	it('is the same reading of one number on every speaker surface', () => {
		const past = '2020-01-01T12:00:00.000Z';
		const future = '2099-06-01T12:00:00.000Z';
		const at = new Date('2026-08-17T00:20:00.000Z');

		expect(isTaskOverdue(past, at)).toBe(true);
		expect(isTaskOverdue(future, at)).toBe(false);
		expect(isTaskOverdue(null, at)).toBe(false);
	});
});
