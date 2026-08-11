import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { dayOf, formatDayTime, joinDayTime, timeOf } from './date-value';
import DateTimePicker from './datetime-picker.svelte';

/**
 * The deadline field the organizer sees (#124), and the one the server reads.
 *
 * This replaced `<input type="datetime-local">` on the CFP settings form, where
 * the value goes through `new Date(raw).toISOString()` on submit before the
 * action's `when()` parses it. That chain only holds if the field still posts
 * local wall time with no zone suffix — `2027-02-15T23:59` — so that is what is
 * pinned here, not the calendar.
 */
const html = (props: ComponentProps<typeof DateTimePicker>) =>
	render(DateTimePicker, { props }).body;

describe('what the datetime picker posts', () => {
	it('carries the stored moment under the field name, unchanged', () => {
		const body = html({ name: 'closesAt', value: '2027-02-15T23:59' });

		expect(body).toContain('type="hidden"');
		expect(body).toContain('name="closesAt"');
		expect(body).toContain('value="2027-02-15T23:59"');
	});

	it('still posts the field when there is no deadline', () => {
		// `when()` reads '' as "no date" and clears the column; omitting the input
		// would leave yesterday's closing time locking submissions.
		const body = html({ name: 'opensAt' });

		expect(body).toContain('name="opensAt"');
		expect(body).toContain('value=""');
	});

	it('leaves no native datetime field behind', () => {
		const body = html({ name: 'closesAt', value: '2027-02-15T23:59' });

		expect(body).not.toContain('datetime-local');
		expect(body).toContain('data-testid="datetime-picker-closesAt"');
	});

	it('shows the moment in words and the placeholder when there is none', () => {
		expect(html({ name: 'closesAt', value: '2027-02-15T23:59' })).toContain(
			'Feb 15, 2027, 11:59 PM'
		);
		expect(html({ name: 'closesAt', placeholder: 'No closing date' })).toContain('No closing date');
	});
});

describe('the moment a stored value stands for', () => {
	it('splits and rejoins without ever becoming a Date', () => {
		// The round trip is the whole safety argument: a `new Date(...)` in the
		// middle is where an organizer in Berlin gets handed the day before.
		expect(dayOf('2027-02-15T23:59')).toBe('2027-02-15');
		expect(timeOf('2027-02-15T23:59')).toBe('23:59');
		expect(joinDayTime('2027-02-15', '23:59')).toBe('2027-02-15T23:59');
	});

	it('is nothing when either half is missing or impossible', () => {
		// A day with no clock is not a deadline, and posting midnight for it would
		// close the call eleven hours before the organizer meant to.
		expect(joinDayTime('2027-02-15', '')).toBe('');
		expect(joinDayTime('', '23:59')).toBe('');
		expect(joinDayTime('2027-02-31', '23:59')).toBe('');
		expect(joinDayTime('2027-02-15', '24:00')).toBe('');
		expect(timeOf('2027-02-15')).toBe('');
		expect(dayOf(null)).toBe('');
	});

	it('reads back the hour that was typed, not the hour a zone shifts it to', () => {
		expect(formatDayTime('2027-02-15T00:30')).toBe('Feb 15, 2027, 12:30 AM');
		expect(formatDayTime('2027-02-15')).toBe('Feb 15, 2027');
		expect(formatDayTime('')).toBe('');
	});
});
