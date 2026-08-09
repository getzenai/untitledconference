/**
 * Turning a DecisionResult into the sentence the organizer reads afterwards.
 *
 * R3 says the screen names the consequences before the click. This is the other
 * half of that promise: after the click it says which of them actually happened.
 * Shared by the table and the detail page so the two cannot drift into describing
 * the same operation differently.
 */
import type { DecisionResult } from '$lib/server/conference/decisions';

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
	['tasksRemoved', (n) => `${plural(n, 'open speaker task')} withdrawn.`],
	['emailsQueued', (n) => `${plural(n, 'email')} queued.`]
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
