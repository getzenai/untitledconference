/**
 * The sentences that travel with a decline-path decision (#447).
 *
 * `resubmit_with_guidance` needs a Leitsatz — that is the whole point of the
 * outcome. A decline may carry one optional sentence from the person who
 * argued for the talk. Empty is the default: a required feedback field is
 * how every archive filled with mush.
 *
 * Neither sentence is mailed by deciding. Telling people is a later click.
 */
export const SENTENCE_MAX = 280;

function oneLine(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().slice(0, SENTENCE_MAX);
}

export function parseGuidance(
	form: FormData
): { ok: true; text: string } | { ok: false; message: string } {
	const text = oneLine(String(form.get('guidance') ?? ''));
	if (!text) return { ok: false, message: 'Say what they should do differently.' };
	return { ok: true, text };
}

/** Empty is a clean decline. */
export function parseDeclineNote(form: FormData): string | null {
	const text = oneLine(String(form.get('declineNote') ?? ''));
	return text || null;
}

/**
 * The sentence the chosen button cares about. A leftover field from the
 * other button is form state and is dropped.
 */
export function sentenceForDecision(
	form: FormData,
	decision: string
): { ok: true; sentence: string | null } | { ok: false; message: string } {
	if (decision === 'resubmit_with_guidance') {
		const parsed = parseGuidance(form);
		if (!parsed.ok) return parsed;
		return { ok: true, sentence: parsed.text };
	}
	if (decision === 'rejected') return { ok: true, sentence: parseDeclineNote(form) };
	return { ok: true, sentence: null };
}
