/**
 * The speaker's portal edit as a serializable snapshot (#747).
 *
 * Storage is `$lib/forms/browser-draft`. This file only knows what a proposal
 * draft looks like and how to name the scope and baseline so a later server
 * version cannot be silently overwritten. It does not replace the public call's
 * `pending-proposal` store (#750).
 */

import { emptyProposal, type ProposalDraft } from './proposal-draft';

export function portalProposalDraftScope(submissionId: number): string {
	return `portal-proposal:${submissionId}`;
}

function answerIds(answers: Record<number, string>): number[] {
	return Object.keys(answers)
		.map(Number)
		.filter(Number.isInteger)
		.sort((a, b) => a - b);
}

/** Identity of the server proposal this draft was typed from. Field order is not identity. */
export function portalProposalBaseline(draft: ProposalDraft): string {
	return JSON.stringify({
		title: draft.title,
		abstract: draft.abstract,
		keyTakeaway: draft.keyTakeaway,
		audienceLevel: draft.audienceLevel,
		sessionFormatId: draft.sessionFormatId,
		trackId: draft.trackId,
		answers: Object.fromEntries(
			answerIds(draft.answers).map((id) => [id, draft.answers[id] ?? ''])
		),
		speaker: {
			name: draft.speaker.name,
			sortName: draft.speaker.sortName,
			email: draft.speaker.email,
			jobTitle: draft.speaker.jobTitle,
			company: draft.speaker.company,
			bio: draft.speaker.bio
		},
		coSpeakers: draft.coSpeakers.map((co) => ({
			name: co.name,
			email: co.email,
			roleLabel: co.roleLabel
		}))
	});
}

export function sameProposalDraft(a: ProposalDraft, b: ProposalDraft): boolean {
	return portalProposalBaseline(a) === portalProposalBaseline(b);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asOptionalInt(value: unknown): number | null | undefined {
	if (value === null) return null;
	if (typeof value === 'number' && Number.isInteger(value)) return value;
	return undefined;
}

function asAnswers(value: unknown): Record<number, string> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const out: Record<number, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		const id = Number(key);
		if (!Number.isInteger(id) || typeof entry !== 'string') return null;
		out[id] = entry;
	}
	return out;
}

function asSpeaker(value: unknown): ProposalDraft['speaker'] | null {
	const row = asRecord(value);
	if (!row) return null;
	const name = asString(row.name);
	const sortName = asString(row.sortName);
	const email = asString(row.email);
	const jobTitle = asString(row.jobTitle);
	const company = asString(row.company);
	const bio = asString(row.bio);
	if (
		name === null ||
		sortName === null ||
		email === null ||
		jobTitle === null ||
		company === null ||
		bio === null
	) {
		return null;
	}
	return { name, sortName, email, jobTitle, company, bio };
}

function asCoSpeakers(value: unknown): ProposalDraft['coSpeakers'] | null {
	if (!Array.isArray(value)) return null;
	const out: ProposalDraft['coSpeakers'] = [];
	for (const entry of value) {
		const row = asRecord(entry);
		if (!row) return null;
		const name = asString(row.name);
		const email = asString(row.email);
		const roleLabel = asString(row.roleLabel);
		if (name === null || email === null || roleLabel === null) return null;
		out.push({ name, email, roleLabel });
	}
	return out;
}

function parseTalkFields(row: Record<string, unknown>): Pick<
	ProposalDraft,
	'title' | 'abstract' | 'keyTakeaway' | 'audienceLevel' | 'sessionFormatId' | 'trackId'
> | null {
	const title = asString(row.title);
	const abstract = asString(row.abstract);
	const keyTakeaway = asString(row.keyTakeaway);
	const audienceLevel = asString(row.audienceLevel);
	const sessionFormatId = asOptionalInt(row.sessionFormatId);
	const trackId = asOptionalInt(row.trackId);
	if (
		title === null ||
		abstract === null ||
		keyTakeaway === null ||
		audienceLevel === null ||
		sessionFormatId === undefined ||
		trackId === undefined
	) {
		return null;
	}
	return { title, abstract, keyTakeaway, audienceLevel, sessionFormatId, trackId };
}

/** The helper's `parse` callback: a usable draft, or nothing. */
export function parsePortalProposalDraft(value: unknown): ProposalDraft | null {
	const row = asRecord(value);
	if (!row) return null;
	const talk = parseTalkFields(row);
	const answers = asAnswers(row.answers);
	const speaker = asSpeaker(row.speaker);
	const coSpeakers = asCoSpeakers(row.coSpeakers);
	if (!talk || answers === null || speaker === null || coSpeakers === null) return null;
	return { ...emptyProposal(), ...talk, answers, speaker, coSpeakers };
}
