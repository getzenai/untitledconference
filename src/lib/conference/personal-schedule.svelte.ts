import { browser } from '$app/environment';
import type { ResolvedSession } from './public-view';

/**
 * The attendee's starred sessions (EMB-10), kept in `localStorage` so they
 * survive a full page reload (EMB-11).
 *
 * Deliberately not a cookie and not a server record: the itinerary is readable
 * without an account, so there is no user to hang the selection on. The trade is
 * explicit — the list lives in this browser only, and the .ics export exists so
 * it can leave.
 *
 * Keyed per conference, or two events in the same browser would share one list.
 */
export class PersonalSchedule {
	#key: string;
	#ids = $state<string[]>([]);

	constructor(conferenceId: string) {
		this.#key = `untitledconference:starred:${conferenceId}`;
		if (browser) {
			try {
				const raw = localStorage.getItem(this.#key);
				const parsed: unknown = raw ? JSON.parse(raw) : [];
				// Anything can be in localStorage — another tab, an older build, a
				// person with the console open. Treat it as untrusted input.
				if (Array.isArray(parsed)) this.#ids = parsed.filter((v) => typeof v === 'string');
			} catch {
				this.#ids = [];
			}
		}
	}

	get ids() {
		return this.#ids;
	}

	get size() {
		return this.#ids.length;
	}

	has(id: string) {
		return this.#ids.includes(id);
	}

	toggle(id: string) {
		this.#ids = this.has(id) ? this.#ids.filter((v) => v !== id) : [...this.#ids, id];
		this.#persist();
	}

	clear() {
		this.#ids = [];
		this.#persist();
	}

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(this.#key, JSON.stringify(this.#ids));
		} catch {
			// Private mode, or a full quota. The selection still works for this
			// visit; silently losing it on reload beats breaking the page.
		}
	}
}

const stampUtc = (d: Date) =>
	d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');

/** Escape per RFC 5545: commas, semicolons, backslashes and newlines are structural. */
const escapeIcs = (value: string) => value.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');

export function buildIcs(conferenceName: string, sessions: ResolvedSession[]): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Untitled Conference//Schedule//EN',
		'CALSCALE:GREGORIAN',
		`X-WR-CALNAME:${escapeIcs(conferenceName)}`
	];

	for (const session of sessions) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${session.id}@untitledconference`,
			`DTSTAMP:${stampUtc(session.start)}`,
			`DTSTART:${stampUtc(session.start)}`,
			`DTEND:${stampUtc(session.end)}`,
			`SUMMARY:${escapeIcs(session.title)}`,
			`DESCRIPTION:${escapeIcs(session.description)}`,
			...(session.room ? [`LOCATION:${escapeIcs(session.room)}`] : []),
			'END:VEVENT'
		);
	}

	lines.push('END:VCALENDAR');
	return lines.join('\r\n');
}
