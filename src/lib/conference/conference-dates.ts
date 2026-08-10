/**
 * The conference date range, and the days that follow from it.
 *
 * A conference day is derived, never typed in. The organizer already states when
 * the event runs — asking them to then enumerate the same days one by one is a
 * second source for one fact, and the two drift the moment somebody moves the
 * event by a week.
 *
 * Everything here is pure and works on `YYYY-MM-DD` strings, the shape the
 * `date` columns use on both sides of the wire. Comparisons are string
 * comparisons: for that format they are exactly calendar order, and they stay
 * off the server's timezone, which would otherwise shift a day either side of
 * midnight.
 */

/**
 * The longest range days are derived for.
 *
 * Not a product limit — a typo guard. `2028` mistyped as `2088` is one keystroke
 * and sixty years of rows, and the organizer would meet it as a browser that
 * stopped responding rather than as a message.
 */
export const MAX_CONFERENCE_DAYS = 60;

/**
 * A real calendar day written `YYYY-MM-DD`.
 *
 * The pattern alone would pass `2027-02-31`, so the parsed date has to agree
 * with the text it came from — `Date` silently rolls February 31st into March
 * 3rd rather than refusing it. `Date.UTC` keeps the comparison off the server's
 * timezone.
 */
export function isCalendarDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;

	const [, year, month, day] = match.map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));

	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
	);
}

/**
 * The field whose date is wrong, or null when the range is fine.
 *
 * Both bounds stay optional — a conference may exist before its dates are
 * settled — but whatever arrives has to be a date. A posted form carries
 * whatever the sender typed, `type="date"` or not, and an unparseable value used
 * to travel all the way to Postgres and come back as a 500.
 */
export function invalidRangeField(
	startsOn: string | null,
	endsOn: string | null
): 'startsOn' | 'endsOn' | null {
	if (startsOn !== null && !isCalendarDate(startsOn)) return 'startsOn';
	if (endsOn !== null && !isCalendarDate(endsOn)) return 'endsOn';

	// A conference that ends before it starts is a typo the organizer should see
	// now rather than on the public page.
	if (startsOn && endsOn && endsOn < startsOn) return 'endsOn';

	if (startsOn && datesInRange(startsOn, endsOn).length > MAX_CONFERENCE_DAYS) return 'endsOn';

	return null;
}

/**
 * Every calendar day the conference covers, ascending.
 *
 * A missing end date means a one-day event rather than an unknown one: the
 * organizer who filled in only the start still gets a grid to work on, and
 * setting the end later extends it. A missing start means the range is unknown,
 * and an unknown range derives nothing — that is what keeps a half-filled form
 * from being read as "this conference has no days".
 *
 * The walk is in UTC milliseconds rather than `setDate`, which would follow the
 * host's timezone across a DST boundary and produce the same day twice.
 */
export function datesInRange(startsOn: string | null, endsOn: string | null): string[] {
	if (!startsOn || !isCalendarDate(startsOn)) return [];

	const last = endsOn && isCalendarDate(endsOn) ? endsOn : startsOn;
	if (last < startsOn) return [];

	const days: string[] = [];
	const DAY_MS = 24 * 60 * 60 * 1000;

	for (let at = Date.parse(`${startsOn}T00:00:00Z`); ; at += DAY_MS) {
		const day = new Date(at).toISOString().slice(0, 10);
		days.push(day);
		if (day >= last || days.length > MAX_CONFERENCE_DAYS) break;
	}

	return days;
}
