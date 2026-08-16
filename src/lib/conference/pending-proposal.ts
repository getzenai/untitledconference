/**
 * Two parked copies of a filled-in proposal, different lifetimes.
 *
 * The pending draft is the signed-out visitor's sign-in round trip (#236, #624):
 * written on submit or draft, consumed once on the way back so it cannot
 * become a second automatic save. sessionStorage, because that trip is same-tab.
 *
 * The autosaved draft is the sentence on the call (#494): "Drafts are saved."
 * Written as they type, read (not consumed) when they come back, cleared when
 * a save actually lands. localStorage, not sessionStorage — closing the tab
 * is exactly the thing the sentence said they could do.
 *
 * Which is why the autosaved copy carries an owner and an age (#505). A draft
 * holds a name, an email address and a bio, and localStorage is per browser,
 * not per tab and not per account: on a shared machine the next person opened
 * the same call and found the last one's proposal in the form, ready to send
 * under their own account. So a signed-in reader only ever sees their own key,
 * an anonymous copy crosses over exactly once through the same-tab sign-in
 * handoff above, and anything older than `DRAFT_MAX_AGE_MS` is deleted on the
 * way out rather than offered.
 *
 * Storage is passed in, not read from the global, so the parse/consume rules
 * can be tested without a browser.
 */
import { emptyProposal, type ProposalDraft } from './proposal-draft';

const PENDING_PREFIX = 'cfp-pending-proposal:';
const AUTOSAVE_PREFIX = 'cfp-autosaved-proposal:';

/**
 * Who typed it: the user id when signed in, `null` while nobody is.
 *
 * The anonymous slot cannot be keyed by user because there is no user yet —
 * that is the whole point of the journey it serves. It is kept narrow instead:
 * adoptable only through the one-time handoff, and swept as soon as a signed-in
 * reader opens the same call.
 */
export type DraftOwner = string | null;
export type PendingProposalIntent = 'continue' | 'draft' | 'submit';
export type PendingProposal = { draft: ProposalDraft; intent: PendingProposalIntent };
export type RegistrationProposal = PendingProposal & { slug: string };

/**
 * Long enough that a call's own deadline runs out first in every normal case,
 * short enough that an abandoned draft does not sit in a public browser for
 * a year.
 */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function pendingProposalKey(slug: string): string {
	return `${PENDING_PREFIX}${slug}`;
}

export function autosavedProposalKey(slug: string, owner: DraftOwner): string {
	return owner ? `${AUTOSAVE_PREFIX}${slug}:u${owner}` : `${AUTOSAVE_PREFIX}${slug}`;
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

/** An object, not an array and not null — the only shape either parser reads. */
function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/** Reject junk so a leftover string cannot become an automatic save. */
export function parsePendingProposal(raw: string): PendingProposal | null {
	try {
		const row = asRecord(JSON.parse(raw));
		if (!row) return null;
		// Bare drafts were written before #624 and always meant submit.
		const parked = asRecord(row.draft);
		const draft = draftFromUnknown(parked ?? row);
		if (!isTypedProposal(draft)) return null;
		const intent = row.intent === 'continue' || row.intent === 'draft' ? row.intent : 'submit';
		return { draft, intent };
	} catch {
		return null;
	}
}

/**
 * The subset of a sign-up body the auth hook is allowed to persist.
 *
 * Better Auth deliberately accepts additional fields in the request body, but
 * none of those fields are trusted. Parse the proposal back through the same
 * narrow reader as browser storage and keep the slug bounded before it reaches
 * the shared verification table.
 */
export function parseRegistrationProposal(value: unknown): RegistrationProposal | null {
	const row = asRecord(value);
	if (!row || typeof row.slug !== 'string' || row.slug.length === 0 || row.slug.length > 255) {
		return null;
	}
	const pending = parsePendingProposal(JSON.stringify(row));
	return pending ? { slug: row.slug, ...pending } : null;
}

/** Read without consuming, so a failed sign-up still leaves the same-tab fallback intact. */
export function readPendingProposal(
	storage: Pick<Storage, 'getItem'>,
	slug: string
): PendingProposal | null {
	const raw = storage.getItem(pendingProposalKey(slug));
	return raw == null ? null : parsePendingProposal(raw);
}

export function writePendingProposal(
	storage: Pick<Storage, 'setItem'>,
	slug: string,
	draft: ProposalDraft,
	intent: PendingProposalIntent
): void {
	storage.setItem(
		pendingProposalKey(slug),
		JSON.stringify({ draft, intent } satisfies PendingProposal)
	);
}

export function consumePendingProposal(
	storage: Pick<Storage, 'getItem' | 'removeItem'>,
	slug: string
): PendingProposal | null {
	const key = pendingProposalKey(slug);
	const raw = storage.getItem(key);
	storage.removeItem(key);
	if (raw == null) return null;
	return parsePendingProposal(raw);
}

/** A draft plus when it was written, so the page can say where it came from. */
export type AutosavedProposal = { draft: ProposalDraft; savedAt: number };

export function writeAutosavedProposal(
	storage: Pick<Storage, 'setItem'>,
	slug: string,
	owner: DraftOwner,
	draft: ProposalDraft,
	now: number = Date.now()
): void {
	storage.setItem(
		autosavedProposalKey(slug, owner),
		JSON.stringify({ savedAt: now, draft } satisfies { savedAt: number; draft: ProposalDraft })
	);
}

/**
 * Read without removing — coming back a second time must still find it.
 *
 * Except when it is too old, or when it predates the envelope: a bare draft
 * with no `savedAt` is one of the copies this issue is about, written before
 * anything bounded them, so it is deleted rather than restored. The cost is a
 * draft typed in the last minutes of the old build; the alternative is keeping
 * exactly the copies whose age nobody can vouch for.
 */
export function readAutosavedProposal(
	storage: Pick<Storage, 'getItem' | 'removeItem'>,
	slug: string,
	owner: DraftOwner,
	now: number = Date.now()
): AutosavedProposal | null {
	const key = autosavedProposalKey(slug, owner);
	const raw = storage.getItem(key);
	if (raw == null) return null;

	const saved = parseAutosavedProposal(raw);
	if (!saved || now - saved.savedAt > DRAFT_MAX_AGE_MS) {
		storage.removeItem(key);
		return null;
	}
	return saved;
}

/** The envelope, or nothing: no timestamp is as good as no draft here. */
function parseAutosavedProposal(raw: string): AutosavedProposal | null {
	try {
		const row = asRecord(JSON.parse(raw));
		const parked = row && asRecord(row.draft);
		if (!row || !parked) return null;
		if (typeof row.savedAt !== 'number' || !Number.isFinite(row.savedAt)) return null;
		const draft = draftFromUnknown(parked);
		return isTypedProposal(draft) ? { draft, savedAt: row.savedAt } : null;
	} catch {
		return null;
	}
}

export function clearAutosavedProposal(
	storage: Pick<Storage, 'removeItem'>,
	slug: string,
	owner: DraftOwner
): void {
	storage.removeItem(autosavedProposalKey(slug, owner));
}

/**
 * Everything this module ever parked, for every call and every owner.
 *
 * Signing out is the moment a browser stops being one person's, so it is the
 * moment the typed name, email and bio stop being fair game for whoever sits
 * down next.
 */
export function clearProposalDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
	const keys: string[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (key && (key.startsWith(AUTOSAVE_PREFIX) || key.startsWith(PENDING_PREFIX))) keys.push(key);
	}
	for (const key of keys) storage.removeItem(key);
}
