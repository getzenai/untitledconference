/**
 * The public call's close date as one calendar event (#510).
 *
 * `ical.ts` writes the format. This file is the product meaning: a deadline is
 * an instant, `CalendarEvent` wants a span, and a short block *ending* at the
 * close reads as "this is when" in a phone's day view. A zero-length dot at
 * `closesAt` is legal and most calendars hide it.
 *
 * UTC, not a named zone. The public page already stores and prints the instant
 * that way (`deadline.ts`); a VTIMEZONE here would put the same close on two
 * clocks. New York and Berlin then see different wall times of the same evening,
 * which is the truth, not a conversion we invented.
 */
import { attachmentFilename } from './csv';
import { icalFile, type CalendarEvent } from './ical';

/** Fifteen minutes is long enough to see and short enough not to look like a talk. */
export const CFP_DEADLINE_MINUTES = 15;

export type CfpDeadline = {
	formId: number;
	conferenceName: string;
	formTitle: string;
	closesAt: Date;
	url: string;
};

/**
 * Conference name in front of the call title, once (#528).
 *
 * The default form title is already `<Name> — Call for papers`. Prepending
 * unconditionally stutters in a speaker's calendar, between events they wrote
 * themselves. Prefix only when the title does not already carry the name.
 * SUMMARY, X-WR-CALNAME and the filename all read this.
 */
export function namedCall(conferenceName: string, formTitle: string): string {
	const name = conferenceName.trim();
	const title = formTitle.trim();
	if (name && title.toLowerCase().includes(name.toLowerCase())) return title;
	if (!name) return title;
	if (!title) return name;
	return `${name} — ${title}`;
}

export function cfpDeadlineEvent(deadline: CfpDeadline): CalendarEvent {
	const start = new Date(deadline.closesAt.getTime() - CFP_DEADLINE_MINUTES * 60 * 1000);
	return {
		uid: `cfp-${deadline.formId}@untitledconference`,
		start,
		end: deadline.closesAt,
		// A deadline is a moment, not a wall clock: a call closing at 23:59 EDT
		// closed at 05:59 for the reader in Berlin, and their calendar must say so.
		timing: 'instant',
		summary: `${namedCall(deadline.conferenceName, deadline.formTitle)} closes`,
		description: 'The call for papers closes at this moment.',
		url: deadline.url
	};
}

export function cfpDeadlineCalendar(deadline: CfpDeadline, now: Date): string {
	return icalFile(
		namedCall(deadline.conferenceName, deadline.formTitle),
		[cfpDeadlineEvent(deadline)],
		now
	);
}

/** `DevFlow-Conf-2027-Call-for-papers.ics` — safe for `Content-Disposition`. */
export function cfpDeadlineFilename(conferenceName: string, formTitle: string): string {
	return attachmentFilename('ics', namedCall(conferenceName, formTitle));
}

export function cfpDeadlinePath(slug: string): string {
	return `/c/${slug}/cfp.ics`;
}
