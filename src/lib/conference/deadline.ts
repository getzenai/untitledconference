/**
 * One shape for a deadline, and the zone it was read in, always named.
 *
 * A deadline is an *instant* — `closes_at` is `timestamptz`, one moment on the
 * clock of the world. A conference day is not: "12 May 2027" is the 12th in
 * Berlin and in Denver, and giving it a zone would be an invention. That is the
 * line this module draws, and why it does not replace `formatDayLong` and
 * friends in `public-view`: those render calendar days and fixture wall clocks,
 * which have no zone to name.
 *
 * The bug this exists for (#468): the organizer form rendered the instant in
 * the browser's zone, the public page rendered its *UTC day* and dropped the
 * time. `2027-02-15T23:59Z` is therefore "Feb 16, 2027, 12:59 AM" to an
 * organizer in Berlin and "Monday 15 February 2027" to the speaker reading the
 * same row. Both were right and neither said in which zone, so there was no way
 * to tell the disagreement from a bug — and the value decides whether a talk is
 * accepted at all.
 *
 * The rule here is not "pick a zone and impose it". It is: whatever zone a
 * screen renders in, it says so. Two readers in the same zone then always read
 * the same words; two readers in different zones read different wall clocks
 * that each name their own offset, which is the truth rather than a collision.
 */

/** The one clock: day-first, 24-hour, zone spelled out. */
const STAMP_OPTIONS: Intl.DateTimeFormatOptions = {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZoneName: 'short'
};

/**
 * The zone every server render uses.
 *
 * The server does not know where the reader is, so it names the only zone it
 * can stand behind. `readerZone` swaps in the browser's own once there is a
 * browser; until then "UTC" is a true statement rather than a guess that would
 * have to be corrected.
 */
export const SERVER_ZONE = 'UTC';

/**
 * `15 Feb 2027, 23:59 UTC` — the same instant, in the zone asked for.
 *
 * Invalid input renders nothing rather than "Invalid Date": a deadline that
 * cannot be read is better absent than wrong, and every caller already has a
 * branch for "no closing date".
 */
export function formatInstant(
	value: Date | string | null | undefined,
	timeZone: string = SERVER_ZONE
): string {
	if (!value) return '';

	const at = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(at.getTime())) return '';

	return new Intl.DateTimeFormat('en-GB', { ...STAMP_OPTIONS, timeZone }).format(at);
}

/**
 * How that zone is written on its own — "UTC", "CET", "GMT-5".
 *
 * For the sentence beside an input, where the organizer needs to know which
 * clock they are typing in before there is a value to format. Taken from a
 * formatted stamp rather than from the IANA name so that the abbreviation next
 * to the picker is the same string the label under it will show.
 *
 * `at` matters because an abbreviation is not a property of a zone but of a
 * moment in it: Berlin is CET in February and CEST in July. Pass the deadline
 * being edited when there is one, so the hint names the offset that will
 * actually apply to it.
 */
export function zoneLabel(timeZone: string = SERVER_ZONE, at: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		timeZoneName: 'short'
	}).formatToParts(at);

	return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
}
