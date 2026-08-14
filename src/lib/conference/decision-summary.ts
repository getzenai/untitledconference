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

/**
 * Why Accept / Waitlist / Decline is dead on a single submission (#471).
 *
 * The bulk summary still says "N drafts not submitted yet, left for the speaker"
 * after a mixed click — that sentence earns its keep on the table. On one
 * talk the same click used to paint that line in success green while the
 * status stayed Draft, so an organizer walking twenty of them thought they
 * had decided. The buttons go grey instead, and this is the sentence next
 * to them. The server refuses the same case: a disabled button is not a lock.
 */
export const DRAFT_DECISION_REASON =
	'This draft has not been submitted yet — leave it for the speaker.';

/** `null` when Accept / Waitlist / Decline may run. */
export function decisionBlockReason(status: string): string | null {
	return status === 'draft' ? DRAFT_DECISION_REASON : null;
}

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

	// The screen only lists handed-in work, so this should never fire here. It is
	// still said out loud rather than folded into silence: a click that decided
	// fewer rows than were ticked has to say which ones it left, or the organizer
	// reads the difference as a lost write.
	if (result.skippedDrafts > 0) {
		parts.push(`${plural(result.skippedDrafts, 'draft')} not submitted yet, left for the speaker.`);
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

const SKIP_REASON_ORDER = [
	'empty_committee',
	'committee_too_small',
	'pool_exhausted',
	'track_restricted',
	'speaker_conflict',
	'not_eligible',
	'not_in_round',
	'not_on_conference'
] as const;

/**
 * Each label names the handgrip, because that is the only reason to show a
 * reason at all. "Over the cap" and "no one left to ask" look alike on the
 * screen and mean opposite things to do: raise the cap, or invite people.
 */
const SKIP_REASON_LABEL: Record<(typeof SKIP_REASON_ORDER)[number], (n: number) => string> = {
	// Covers both readings: no reviewer sits in this round at all, and none of
	// the reviewers you ticked does.
	empty_committee: (n) => `${n} with no reviewer in this round`,
	committee_too_small: (n) => `${n} with no one left to ask`,
	pool_exhausted: (n) => `${n} over the cap`,
	track_restricted: (n) => `${n} track-restricted`,
	speaker_conflict: (n) => `${n} speaker conflict${n === 1 ? '' : 's'}`,
	not_eligible: (n) => `${n} no longer eligible`,
	not_in_round: (n) => `${n} not on this round`,
	not_on_conference: (n) => `${n} not on this conference`
};

function describeSkipReasons(items: { reason: string }[]): string {
	const counts = new Map<string, number>();
	for (const item of items) {
		counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
	}
	const parts: string[] = [];
	for (const reason of SKIP_REASON_ORDER) {
		const n = counts.get(reason);
		if (n) parts.push(SKIP_REASON_LABEL[reason](n));
	}
	for (const [reason, n] of counts) {
		if (!(reason in SKIP_REASON_LABEL)) parts.push(`${n} ${reason.replaceAll('_', ' ')}`);
	}
	return parts.join(', ');
}

/** Confirmation after bulk reviewer assignment on the submissions table (ABS-06). */
export function describeBulkAssign(result: {
	created: number;
	already: number;
	skipped: number;
	/** Recusals bulk left alone (optional so older call sites still type-check). */
	recused?: number;
	/** Why each skipped seat was refused — named in the sentence when present. */
	skippedItems?: { reason: string }[];
}): string {
	const parts: string[] = [];
	if (result.created > 0) {
		parts.push(`${plural(result.created, 'assignment')} created.`);
	}
	if (result.already > 0) {
		// Always name the count — the DoD asks for N created / M already, not a vague shrug.
		parts.push(`${result.already} already assigned, left untouched.`);
	}
	if ((result.recused ?? 0) > 0) {
		// Tell the organizer what they can still do — single-cell reassign overrides.
		parts.push(
			`${result.recused} recused seats left alone — flip each on the submission if you mean to override.`
		);
	}
	if (result.skipped > 0) {
		const named = result.skippedItems?.length ? describeSkipReasons(result.skippedItems) : '';
		parts.push(
			named
				? `${plural(result.skipped, 'assignment')} skipped: ${named}.`
				: `${plural(result.skipped, 'assignment')} skipped.`
		);
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
