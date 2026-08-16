/**
 * Writing iCalendar that a calendar reads back as what we wrote (EMB-11).
 *
 * Pure and on its own, for the same reason `csv.ts` is: every interesting thing
 * about this format is a detail that looks like nothing. A comma in a talk title,
 * a newline in an abstract, a line one byte too long, a `\n` instead of a `\r\n` —
 * each of them produces a file that either fails to import with no useful message
 * or, worse, imports and shows something other than what we wrote, on somebody
 * else's phone, weeks later.
 *
 * The format is RFC 5545. The three rules that actually bite are all in here:
 * TEXT escaping (§3.3.11), line folding at 75 octets (§3.1) and CRLF everywhere.
 */

/**
 * One entry in the feed, already resolved — no ids, no lookups.
 *
 * `uid` is the caller's job because stability is the caller's knowledge: a
 * calendar that has already subscribed matches events by UID alone, so a UID
 * derived from anything that moves (position in the day, a title someone edits)
 * turns one corrected talk into a duplicate on every subscriber's phone.
 */
export type CalendarEvent = {
	uid: string;
	start: Date;
	end: Date;
	summary: string;
	description?: string | null;
	location?: string | null;
	url?: string | null;
};

/**
 * When a session happens, as a *floating* time: `20270415T093000`, no `Z` (#821).
 *
 * RFC 5545 §3.3.5 has three forms, and only the third one says what this product
 * means. A UTC instant (`…Z`) and a zoned time (`TZID=` plus a VTIMEZONE block)
 * both name a moment on the world clock, so a calendar re-renders them in the
 * reader's own zone. A floating time names a wall clock and no zone: every
 * reader sees 09:30.
 *
 * That is exactly what the public pages do — `public-view.ts` formats every time
 * in UTC on purpose, so the grid reads 09:30 in New York and in Auckland alike.
 * The `…Z` this used to write meant the opposite, and the file disagreed with the
 * page it came from: an attendee at a venue in `America/Los_Angeles` starred the
 * 09:30 talk and their calendar showed 02:30.
 *
 * The trade is the one the pages already take: a floating time cannot survive the
 * conference moving zones, and it is the wrong answer for a reader who wants
 * "when is that for me" from an online event. Both need a real zone stored on the
 * conference — and on the day that exists, this becomes `TZID` in the file *and*
 * on the page, together, or the two part company again.
 *
 * Built from `toISOString`, never from the local getters, so the string is the
 * same on a server in any zone: a formatter reading the host's clock would put
 * the whole feed hours off wherever a machine is not on UTC, and CI is on UTC.
 */
function wallClock(at: Date): string {
	return at
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '')
		.replace('Z', '');
}

/**
 * When we wrote the file: a real instant, so it keeps its `Z`.
 *
 * DTSTAMP is not the session. It is the moment this line was produced, and it is
 * what a calendar compares between two versions of the same UID — a floating
 * DTSTAMP would make "which of these is newer" depend on who is asking.
 */
function instant(at: Date): string {
	return `${wallClock(at)}Z`;
}

/**
 * A TEXT value, escaped.
 *
 * Four characters, and only four: backslash first, or it would escape the
 * escapes we just added. The colon is deliberately not escaped — it is an
 * ordinary character inside a value, and escaping it is the single most common
 * way to make a title read `Batching\: a retrospective` in a phone's calendar.
 *
 * Control characters are dropped rather than escaped. A stray carriage return in
 * a stored abstract would otherwise end the content line and turn the rest of the
 * abstract into a property name — the same class of injection a CR in an HTTP
 * header is.
 */
export function icalText(value: string): string {
	return stripControls(value.replace(/\r\n?/g, '\n'))
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\n/g, '\\n');
}

/**
 * Everything below U+0020 except the tab and the newline the format allows, and
 * DEL. Written as a loop rather than a character-class regex because a literal
 * control character in source is invisible, and an invisible character is one a
 * later edit silently deletes.
 */
function stripControls(value: string): string {
	let kept = '';
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f)) kept += char;
	}
	return kept;
}

/**
 * Folds one content line to 75 octets, continuation lines prefixed with a space.
 *
 * Octets, not characters, and that distinction is the whole reason this is not a
 * `slice(0, 75)`: the limit is a byte limit, an umlaut is two bytes and an emoji
 * is four, and a fold placed by character count both overshoots the limit and can
 * cut a code point in half — which arrives at the reader as a replacement
 * character in a speaker's name. So we measure in bytes and only ever break
 * between code points.
 *
 * 74 for the continuations because the leading space they carry counts towards
 * their own 75.
 */
export function foldIcalLine(line: string): string {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return line;

	const parts: string[] = [];
	let current = '';
	let bytes = 0;
	let limit = 75;

	// `for…of` walks code points, not UTF-16 units, so a surrogate pair is one step.
	for (const char of line) {
		const size = encoder.encode(char).length;
		if (bytes + size > limit) {
			parts.push(current);
			current = '';
			bytes = 0;
			limit = 74;
		}
		current += char;
		bytes += size;
	}
	parts.push(current);

	return parts.join('\r\n ');
}

function property(name: string, value: string): string {
	return foldIcalLine(`${name}:${value}`);
}

/**
 * A whole calendar file.
 *
 * `now` is a parameter rather than a `new Date()` inside, so a test can assert on
 * the bytes: DTSTAMP is required on every event, and an unpinned clock would make
 * every expectation in the test file a moving target.
 *
 * `X-WR-CALNAME` is not in the RFC. It is in here anyway because it is what Apple
 * Calendar, Google Calendar and Outlook actually read to label a subscription —
 * without it the conference appears in the sidebar as the URL it came from.
 */
export function icalFile(calendarName: string, events: CalendarEvent[], now: Date): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//untitledconference//Agenda//EN',
		'CALSCALE:GREGORIAN',
		// PUBLISH, not REQUEST: this is a programme somebody reads, not an invitation
		// that asks them to accept or decline. REQUEST would put Accept/Decline
		// buttons on every talk and mail the organizer the answers.
		'METHOD:PUBLISH',
		property('X-WR-CALNAME', icalText(calendarName))
	];

	for (const event of events) {
		lines.push(
			'BEGIN:VEVENT',
			property('UID', icalText(event.uid)),
			property('DTSTAMP', instant(now)),
			property('DTSTART', wallClock(event.start)),
			property('DTEND', wallClock(event.end)),
			property('SUMMARY', icalText(event.summary))
		);
		if (event.description) lines.push(property('DESCRIPTION', icalText(event.description)));
		if (event.location) lines.push(property('LOCATION', icalText(event.location)));
		// URI, not TEXT: a URL value is not escaped, and escaping the commas in a
		// query string here would break the link it points at.
		if (event.url) lines.push(property('URL', event.url));
		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	// CRLF, and a trailing one: the RFC's grammar terminates every content line,
	// the last one included, and the stricter importers enforce it.
	return `${lines.join('\r\n')}\r\n`;
}
