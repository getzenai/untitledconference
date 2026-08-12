/**
 * Turning a DecisionResult into the sentence the organizer reads afterwards.
 *
 * R3 says the screen names the consequences before the click. This is the other
 * half of that promise: after the click it says which of them actually happened.
 * Shared by the table and the detail page so the two cannot drift into describing
 * the same operation differently.
 */
import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import type { DecisionResult } from '$lib/server/conference/decisions';
import type { DispatchResult } from '$lib/server/conference/email-dispatcher';

const PAST_TENSE: Record<string, string> = {
	accepted: 'accepted',
	rejected: 'declined',
	waitlisted: 'waitlisted'
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The side effects, in the order they are worth reading — created before withdrawn,
 * mail last. A list rather than a run of `if`s so that adding a fifth consequence to
 * `decideSubmissions` is one line here and cannot be half-added.
 */
const SIDE_EFFECTS: [keyof DecisionResult, (n: number) => string][] = [
	['sessionsCreated', (n) => `${plural(n, 'session')} added to the agenda tray.`],
	['tasksCreated', (n) => `${plural(n, 'speaker task')} created.`],
	['sessionsRemoved', (n) => `${plural(n, 'session')} taken out of the agenda tray.`],
	['tasksRemoved', (n) => `${plural(n, 'open speaker task')} withdrawn.`]
];

export function describeDecision(decision: string, result: DecisionResult): string {
	const parts: string[] = [];

	if (result.decided > 0) {
		parts.push(`${plural(result.decided, 'submission')} ${PAST_TENSE[decision] ?? decision}.`);
	}

	// Saying nothing when nothing happened would look like a failed click.
	if (result.unchanged > 0) {
		parts.push(
			result.decided > 0
				? `${result.unchanged} already ${PAST_TENSE[decision] ?? decision}, left untouched.`
				: `Already ${PAST_TENSE[decision] ?? decision} — nothing to do.`
		);
	}

	for (const [key, sentence] of SIDE_EFFECTS) {
		const count = result[key];
		if (count > 0) parts.push(sentence(count));
	}

	return parts.join(' ');
}

/** The separate confirmation after an explicit notification action. */
function describeDispatch(dispatch: DispatchResult | null): string[] {
	if (!dispatch) return [];
	if (dispatch.disabled) return ['Delivery is not configured; the emails remain queued.'];
	const parts: string[] = [];
	if (dispatch.sent > 0) parts.push(`${plural(dispatch.sent, 'email')} sent now.`);
	if (dispatch.failed > 0) {
		parts.push(`${plural(dispatch.failed, 'email')} failed to send; use Notify again to retry.`);
	}
	if (dispatch.remaining > 0) parts.push(`${plural(dispatch.remaining, 'email')} still queued.`);
	return parts;
}

export function describeNotification(result: NotificationResult): string {
	const parts: string[] = [];
	if (result.notified > 0) {
		parts.push(
			`${plural(result.emailsQueued, 'email')} queued for ${plural(result.notified, 'submission')}.`
		);
		parts.push(...describeDispatch(result.dispatch));
	}
	if (result.alreadyNotified > 0) {
		parts.push(
			`${plural(result.alreadyNotified, 'submission')} already had an active notification, left untouched.`
		);
	}
	if (result.notDecided > 0) {
		parts.push(
			`${plural(result.notDecided, 'submission')} ${result.notDecided === 1 ? 'has' : 'have'} no decision yet, skipped.`
		);
	}
	if (result.withoutEmail > 0) {
		parts.push(
			`${plural(result.withoutEmail, 'submission')} ${result.withoutEmail === 1 ? 'has' : 'have'} no speaker email, skipped.`
		);
	}
	return parts.join(' ');
}

/** Confirmation after bulk reviewer assignment on the submissions table (ABS-06). */
export function describeBulkAssign(result: {
	created: number;
	already: number;
	skipped: number;
}): string {
	const parts: string[] = [];
	if (result.created > 0) {
		parts.push(`${plural(result.created, 'assignment')} created.`);
	}
	if (result.already > 0) {
		// Always name the count — the DoD asks for N created / M already, not a vague shrug.
		parts.push(`${result.already} already assigned, left untouched.`);
	}
	if (result.skipped > 0) {
		parts.push(`${plural(result.skipped, 'submission')} could not be assigned to that reviewer.`);
	}
	// Empty batch after a mis-click should still read as a completed action.
	return parts.length > 0 ? parts.join(' ') : 'Nothing to assign.';
}

export type NotificationTone = 'good' | 'warn' | 'bad';

/** The colour and live-region urgency must agree with the delivery result. */
export function notificationTone(result: NotificationResult): NotificationTone {
	if ((result.dispatch?.failed ?? 0) > 0) return 'bad';
	const undelivered = Math.max(0, result.emailsQueued - (result.dispatch?.sent ?? 0));
	const warnings = [
		result.notDecided > 0,
		result.withoutEmail > 0,
		Boolean(result.dispatch?.disabled),
		(result.dispatch?.remaining ?? 0) > 0,
		undelivered > 0
	];
	return warnings.includes(true) ? 'warn' : 'good';
}
