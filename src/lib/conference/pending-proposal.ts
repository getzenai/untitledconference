/**
 * Two parked copies of a filled-in proposal, different lifetimes.
 *
 * The pending draft is the signed-out visitor's sign-in round trip (#236):
 * written on "Sign in to submit", consumed once on the way back so it cannot
 * become a second auto-submit. sessionStorage, because that trip is same-tab.
 *
 * The autosaved draft is the sentence on the call (#494): "Drafts are saved."
 * Written as they type, read (not consumed) when they come back, cleared when
 * a save actually lands. localStorage, not sessionStorage — closing the tab
 * is exactly the thing the sentence said they could do.
 *
 * Storage is passed in, not read from the global, so the parse/consume rules
 * can be tested without a browser.
 */
import { emptyProposal, type ProposalDraft } from './proposal-draft';

const PENDING_PREFIX = 'cfp-pending-proposal:';
const AUTOSAVE_PREFIX = 'cfp-autosaved-proposal:';

export function pendingProposalKey(slug: string): string {
	return `${PENDING_PREFIX}${slug}`;
}

export function autosavedProposalKey(slug: string): string {
	return `${AUTOSAVE_PREFIX}${slug}`;
}

function text(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value : '';
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
	const raw = text(value).trim();
	if (!raw || raw === 'null') return null;
	const parsed = Number(raw);
	return Number.isInteger(parsed) ? parsed : null;
}

/**
 * The same field names `readProposal` reads on the server. Kept here so the
 * client can stash a draft without importing a server module.
 */
export function draftFromFormData(data: FormData): ProposalDraft {
	const answers: Record<number, string> = {};
	for (const [key, value] of data.entries()) {
		if (!key.startsWith('answer:') || typeof value !== 'string') continue;
		const fieldId = Number(key.slice('answer:'.length));
		if (Number.isInteger(fieldId)) answers[fieldId] = value;
	}

	const names = data.getAll('co-name').map((v) => text(v));
	const emails = data.getAll('co-email').map((v) => text(v));
	const roles = data.getAll('co-role').map((v) => text(v));
	const coSpeakers = names
		.map((name, i) => ({
			name,
			email: emails[i] ?? '',
			roleLabel: roles[i] ?? ''
		}))
		.filter((co) => co.name.trim());

	return {
		title: text(data.get('title')),
		abstract: text(data.get('abstract')),
		keyTakeaway: text(data.get('keyTakeaway')),
		audienceLevel: text(data.get('audienceLevel')),
		sessionFormatId: optionalNumber(data.get('sessionFormatId')),
		trackId: optionalNumber(data.get('trackId')),
		answers,
		speaker: {
			name: text(data.get('speakerName')),
			sortName: text(data.get('speakerSortName')),
			email: text(data.get('speakerEmail')),
			jobTitle: text(data.get('speakerJobTitle')),
			company: text(data.get('speakerCompany')),
			bio: text(data.get('speakerBio'))
		},
		coSpeakers
	};
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function asOptionalInt(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function asAnswers(value: unknown): Record<number, string> {
	if (!value || typeof value !== 'object') return {};
	const out: Record<number, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		const id = Number(key);
		if (Number.isInteger(id) && typeof entry === 'string') out[id] = entry;
	}
	return out;
}

function asCoSpeakers(value: unknown): ProposalDraft['coSpeakers'] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
		.map((row) => ({
			name: asString(row.name),
			email: asString(row.email),
			roleLabel: asString(row.roleLabel)
		}))
		.filter((row) => row.name.trim());
}

function speakerFromUnknown(value: unknown): ProposalDraft['speaker'] {
	const speaker = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	const row = speaker as Record<string, unknown>;
	return {
		name: asString(row.name),
		sortName: asString(row.sortName),
		email: asString(row.email),
		jobTitle: asString(row.jobTitle),
		company: asString(row.company),
		bio: asString(row.bio)
	};
}

function draftFromUnknown(row: Record<string, unknown>): ProposalDraft {
	return {
		...emptyProposal(),
		title: asString(row.title),
		abstract: asString(row.abstract),
		keyTakeaway: asString(row.keyTakeaway),
		audienceLevel: asString(row.audienceLevel),
		sessionFormatId: asOptionalInt(row.sessionFormatId),
		trackId: asOptionalInt(row.trackId),
		answers: asAnswers(row.answers),
		speaker: speakerFromUnknown(row.speaker),
		coSpeakers: asCoSpeakers(row.coSpeakers)
	};
}

/** Title, abstract or name — anything less is not a draft, it is an empty form. */
export function isTypedProposal(draft: ProposalDraft): boolean {
	return Boolean(draft.title.trim() || draft.abstract.trim() || draft.speaker.name.trim());
}

/** Reject junk so a leftover string cannot become an auto-submit. */
export function parsePendingProposal(raw: string): ProposalDraft | null {
	try {
		const data: unknown = JSON.parse(raw);
		if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
		const draft = draftFromUnknown(data as Record<string, unknown>);
		return isTypedProposal(draft) ? draft : null;
	} catch {
		return null;
	}
}

export function writePendingProposal(
	storage: Pick<Storage, 'setItem'>,
	slug: string,
	draft: ProposalDraft
): void {
	storage.setItem(pendingProposalKey(slug), JSON.stringify(draft));
}

export function consumePendingProposal(
	storage: Pick<Storage, 'getItem' | 'removeItem'>,
	slug: string
): ProposalDraft | null {
	const key = pendingProposalKey(slug);
	const raw = storage.getItem(key);
	storage.removeItem(key);
	if (raw == null) return null;
	return parsePendingProposal(raw);
}

export function writeAutosavedProposal(
	storage: Pick<Storage, 'setItem'>,
	slug: string,
	draft: ProposalDraft
): void {
	storage.setItem(autosavedProposalKey(slug), JSON.stringify(draft));
}

/** Read without removing — coming back a second time must still find it. */
export function readAutosavedProposal(
	storage: Pick<Storage, 'getItem'>,
	slug: string
): ProposalDraft | null {
	const raw = storage.getItem(autosavedProposalKey(slug));
	if (raw == null) return null;
	return parsePendingProposal(raw);
}

export function clearAutosavedProposal(storage: Pick<Storage, 'removeItem'>, slug: string): void {
	storage.removeItem(autosavedProposalKey(slug));
}
