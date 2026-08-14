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

/**
 * Day-first and 24-hour, matching `formatInstant` (#468).
 *
 * The picker trigger and the status line beneath it show the same timestamp, so
 * they cannot each pick a locale: `/manage/:conf/rounds` printed "Aug 9, 2026,
 * 5:23 PM" in the input and "9 Aug 2026, 17:23" four inches below it. This is
 * the shape both use now. No zone is named here on purpose — the picker holds
 * wall time the organizer typed, not an instant, and `formatInstant` is what
 * renders the stored moment beside it.
 */
const formatter = new DateFormatter('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

/**
 * The label on the trigger — "12 May 2027" — or an empty string.
 *
 * `toDate` is given the local zone so that the day formatted is the day
 * selected; a fixed zone would move the label across midnight for anyone not
 * living in it.
 */
export function formatDay(value: string | null | undefined): string {
	const date = toCalendarDate(value);
	return date ? formatter.format(date.toDate(getLocalTimeZone())) : '';
}

/**
 * A stored moment shown as a day only — "1 May 2026" (#468).
 *
 * For the dates that are administration rather than deadlines: when an account
 * was created, when an invitation runs out. `toLocaleDateString()` with no
 * arguments took the browser's locale, so `/admin/users` read `5/1/2026` on a US
 * machine and `1/5/2026` on a German one — the same cell, two different days,
 * and nothing on screen to say which.
 *
 * It names no zone, unlike `formatInstant`, because nothing hangs on the hour
 * here. If something ever does, that value belongs in `formatInstant` instead.
 */
export function formatStoredDay(value: string | number | Date | null | undefined): string {
	if (!value && value !== 0) return '';

	const at = value instanceof Date ? value : new Date(value);
	return Number.isNaN(at.getTime()) ? '' : formatter.format(at);
}

/**
 * A moment on the wire: `YYYY-MM-DDTHH:mm`, local wall time, no zone suffix.
 *
 * This is what `<input type="datetime-local">` posted and what the CFP action
 * still hands to `new Date(...)`, so the two halves below only ever split and
 * rejoin that string — they never go through a `Date`, which is where the zone
 * would creep back in.
 */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The `HH:mm` half of a stored moment, or an empty string. */
export function timeOf(value: string | null | undefined): string {
	const time = value?.split('T')[1]?.slice(0, 5) ?? '';
	return TIME.test(time) ? time : '';
}

/** The `YYYY-MM-DD` half of a stored moment, or an empty string. */
export function dayOf(value: string | null | undefined): string {
	const day = value?.split('T')[0] ?? '';
	return isCalendarDate(day) ? day : '';
}

/**
 * The two halves back into one wire value.
 *
 * A day without a time is not a moment, so it posts nothing rather than
 * midnight the organizer never chose; a time without a day is nothing at all.
 */
export function joinDayTime(day: string, time: string): string {
	if (!isCalendarDate(day) || !TIME.test(time)) return '';
	return `${day}T${time}`;
}

const clock = new Intl.DateTimeFormat('en-GB', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/**
 * The label on the trigger — "12 May 2027, 09:00" — or an empty string.
 *
 * The clock is formatted from a fixed reference day so that the hour shown is
 * the hour typed; only the calendar half needs the local zone.
 */
export function formatDayTime(value: string | null | undefined): string {
	const day = formatDay(dayOf(value));
	const time = timeOf(value);
	if (!day || !time) return day;

	const [hours, minutes] = time.split(':').map(Number);
	return `${day}, ${clock.format(new Date(2000, 0, 1, hours, minutes))}`;
}
