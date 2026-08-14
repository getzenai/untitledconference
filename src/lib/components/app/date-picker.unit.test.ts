import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DatePicker from './date-picker.svelte';
import { formatDay, formatStoredDay, toCalendarDate } from './date-value';

/**
 * The date field the organizer sees (#124), and the one the server reads.
 *
 * The picker replaced `<input type="date">`, so the claim worth testing is not
 * that a calendar opens — it is that the form data did not change underneath
 * every action that reads `startsOn`: same `name`, same `YYYY-MM-DD`, and an
 * empty field that still posts an empty value rather than dropping the key.
 */
const html = (props: ComponentProps<typeof DatePicker>) => render(DatePicker, { props }).body;

describe('what the date picker posts', () => {
	it('carries the stored day under the field name, unchanged', () => {
		const body = html({ name: 'startsOn', value: '2027-05-12' });

		expect(body).toContain('name="startsOn"');
		expect(body).toContain('value="2027-05-12"');
		expect(body).toContain('type="hidden"');
	});

	it('still posts the field when there is no date', () => {
		// An action that reads `formData.get('dueOn')` gets '' and clears the
		// date; a picker that omitted the input would leave the old one standing.
		const body = html({ name: 'dueOn' });

		expect(body).toContain('name="dueOn"');
		expect(body).toContain('value=""');
	});

	it('shows the day in words and the placeholder when there is none', () => {
		expect(html({ name: 'startsOn', value: '2027-05-12' })).toContain('12 May 2027');
		expect(html({ name: 'startsOn', value: '', placeholder: 'Pick a date' })).toContain(
			'Pick a date'
		);
	});

	it('leaves nothing native behind on the server-rendered page', () => {
		// The point of the change: no browser widget, no second date on the page
		// for a form action to pick up. The calendar itself lives inside the
		// popover and is not rendered until it is opened, so it is out of reach
		// here by construction.
		const body = html({ name: 'startsOn', value: '2027-05-12' });

		expect(body).not.toContain('type="date"');
		expect(body).toContain('data-testid="date-picker-startsOn"');
	});
});

describe('the day a stored value stands for', () => {
	it('is the day that was written, not the one a timezone shifts it to', () => {
		// `new Date('2027-05-12').toISOString().slice(0, 10)` is how this goes
		// wrong west of UTC; the calendar types never leave calendar arithmetic.
		const date = toCalendarDate('2027-05-12');

		expect(date?.year).toBe(2027);
		expect(date?.month).toBe(5);
		expect(date?.day).toBe(12);
		expect(date?.toString()).toBe('2027-05-12');
	});

	it('is nothing when the text is not a day the server would accept either', () => {
		expect(toCalendarDate('2027-02-31')).toBeUndefined();
		expect(toCalendarDate('12.05.2027')).toBeUndefined();
		expect(toCalendarDate('')).toBeUndefined();
		expect(toCalendarDate(null)).toBeUndefined();
		expect(formatDay('2027-02-31')).toBe('');
	});
});

/**
 * The administration dates — created, expires (#468).
 *
 * Not deadlines: no zone is named, because nothing hangs on the hour. What is
 * worth pinning is that the day-first shape does not depend on the machine the
 * browser happens to run on, which is exactly what `/admin/users` got wrong.
 */
describe('formatStoredDay', () => {
	it("is day-first regardless of the reader's locale", () => {
		expect(formatStoredDay('2026-05-01T09:30:00.000Z')).toBe('1 May 2026');
		expect(formatStoredDay(new Date('2026-05-01T09:30:00.000Z'))).toBe('1 May 2026');
	});

	it('is nothing rather than "Invalid Date" when the value is not one', () => {
		expect(formatStoredDay(null)).toBe('');
		expect(formatStoredDay(undefined)).toBe('');
		expect(formatStoredDay('')).toBe('');
		expect(formatStoredDay('not a date')).toBe('');
	});
});
