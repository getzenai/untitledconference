/**
 * The two conversions a date field needs, and nothing else.
 *
 * The wire format stays `YYYY-MM-DD` — the shape the `date` columns and
 * `isCalendarDate` already agree on. Everything here goes through
 * `@internationalized/date`, which counts in calendar days rather than
 * milliseconds since an epoch: `new Date('2027-05-12').toISOString()` is the
 * classic way to hand an organizer west of UTC the 11th, and a calendar that
 * shows the day before the one that was clicked is worse than a native one.
 */
import { isCalendarDate } from '$lib/conference/conference-dates';
import { CalendarDate, DateFormatter, getLocalTimeZone } from '@internationalized/date';

/**
 * A stored `YYYY-MM-DD` as a calendar day, or nothing.
 *
 * Anything the picker cannot stand behind is nothing: an empty field, a null
 * from a column that allows one, and `2027-02-31`, which matches the pattern
 * and is not a day. `isCalendarDate` is the server's own test, so the picker
 * refuses exactly what the action refuses.
 */
export function toCalendarDate(value: string | null | undefined): CalendarDate | undefined {
	if (!value || !isCalendarDate(value)) return undefined;

	const [year, month, day] = value.split('-').map(Number);
	return new CalendarDate(year, month, day);
}

const formatter = new DateFormatter('en-US', { dateStyle: 'medium' });

/**
 * The label on the trigger — "May 12, 2027" — or an empty string.
 *
 * `toDate` is given the local zone so that the day formatted is the day
 * selected; a fixed zone would move the label across midnight for anyone not
 * living in it.
 */
export function formatDay(value: string | null | undefined): string {
	const date = toCalendarDate(value);
	return date ? formatter.format(date.toDate(getLocalTimeZone())) : '';
}
