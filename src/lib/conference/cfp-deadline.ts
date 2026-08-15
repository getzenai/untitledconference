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

export function cfpDeadlineEvent(deadline: CfpDeadline): CalendarEvent {
	const start = new Date(deadline.closesAt.getTime() - CFP_DEADLINE_MINUTES * 60 * 1000);
	return {
		uid: `cfp-${deadline.formId}@untitledconference`,
		start,
		end: deadline.closesAt,
		summary: `${deadline.conferenceName} — ${deadline.formTitle} closes`,
		description: 'The call for papers closes at this moment.',
		url: deadline.url
	};
}

export function cfpDeadlineCalendar(deadline: CfpDeadline, now: Date): string {
	return icalFile(
		`${deadline.conferenceName} — ${deadline.formTitle}`,
		[cfpDeadlineEvent(deadline)],
		now
	);
}

/** `DevFlow-Conf-2027-Call-for-papers.ics` — safe for `Content-Disposition`. */
export function cfpDeadlineFilename(conferenceName: string, formTitle: string): string {
	return attachmentFilename('ics', conferenceName, formTitle);
}

export function cfpDeadlinePath(slug: string): string {
	return `/c/${slug}/cfp.ics`;
}
