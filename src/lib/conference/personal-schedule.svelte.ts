import { browser } from '$app/environment';
import type { CalendarEvent } from './ical';
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

/**
 * The starred sessions as calendar events, for `icalFile` to write (#822).
 *
 * This module used to build the bytes itself, next to a module written for
 * exactly that — and the second copy had none of what the first one is: no
 * folding at 75 octets, no control-character stripping, no trailing CRLF, and a
 * DTSTAMP that was the session's own start rather than the moment of writing.
 * The mapping is the part that belongs here, because which sessions and which
 * fields is this surface's knowledge; the format is not.
 *
 * `uid` matches the subscription feed's on purpose: a reader who both subscribes
 * and exports should end up with one entry per talk, not two.
 */
export function scheduleEvents(sessions: ResolvedSession[]): CalendarEvent[] {
	return sessions.map((session) => ({
		uid: `${session.id}@untitledconference`,
		start: session.start,
		end: session.end,
		// The same wall clock the itinerary prints, not a world-clock moment (#821).
		timing: 'floating',
		summary: session.title,
		description: session.description,
		location: session.room
	}));
}
