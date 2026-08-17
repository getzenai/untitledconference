/**
 * Two parked copies of a filled-in proposal, different lifetimes (#750).
 *
 * Storage is `$lib/forms/browser-draft`. This file knows what a proposal
 * draft looks like, when it counts as typed, and how to name the two scopes
 * so the sign-in handoff and the autosave cannot become each other.
 *
 * The pending draft is the signed-out visitor's sign-in round trip (#236, #624):
 * written on submit or draft, consumed once on the way back so it cannot
 * become a second automatic save. Callers pass sessionStorage, because that
 * trip is same-tab.
 *
 * The autosaved draft is the sentence on the call (#494, #801): what they
 * filled in stays in this browser. Written as they type or choose, read
 * (not consumed) when they come back, cleared when a save actually lands.
 * Callers pass localStorage — closing the tab is exactly the thing the
 * sentence said they could do.
 *
 * Owner, age, and "empty form is not a draft" live in the helper. A shared
 * browser dropping the previous identity's copy is the helper too (#505).
 *
 * Storage is passed in, not read from the global, so the parse/consume rules
 * can be tested without a browser.
 */
import {
	ANONYMOUS_BROWSER_DRAFT_OWNER,
	BROWSER_DRAFT_MAX_AGE_MS,
	browserDraftKey,
	clearBrowserDraft,
	clearBrowserDrafts,
	readBrowserDraft,
	writeBrowserDraft
} from '$lib/forms/browser-draft';
import { emptyProposal, type ProposalDraft } from './proposal-draft';

/** Pre-#750 keys. Read once, then rewritten into the shared helper. */
const LEGACY_PENDING_PREFIX = 'cfp-pending-proposal:';
const LEGACY_AUTOSAVE_PREFIX = 'cfp-autosaved-proposal:';

const PENDING_OWNER = 'handoff';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

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
 * a year. Same bound the shared helper uses.
 */
export const DRAFT_MAX_AGE_MS = BROWSER_DRAFT_MAX_AGE_MS;

function cfpPendingScope(slug: string): string {
	return `cfp-pending:${slug}`;
}

/**
 * The first proposal on a call uses `cfp-autosave:${slug}`. A second one,
 * started while a server copy already exists, cannot share that key — a
 * reload would either wipe the new typing or overwrite the first copy
 * (#815, #819, #868). `existingId` is that server row, so the two slots
 * cannot meet.
 */
function cfpAutosaveScope(slug: string, existingId?: number): string {
	return existingId == null ? `cfp-autosave:${slug}` : `cfp-autosave:${slug}:another:${existingId}`;
}

function cfpAutosaveOwner(owner: DraftOwner): string {
	return owner ?? ANONYMOUS_BROWSER_DRAFT_OWNER;
}

/** Format and track park beside the proposal blob, not inside a text field (#801). */
const CFP_SELECT_FIELDS = ['sessionFormatId', 'trackId'] as const;

function cfpSelectScope(slug: string, field: string, existingId?: number): string {
	return `${cfpAutosaveScope(slug, existingId)}:${field}`;
}

/** Scope and owner the public call hands the two dropdowns. */
export function autosavedProposalIdentity(
	slug: string,
	owner: DraftOwner,
	existingId?: number
): { scope: string; owner: string } {
	return { scope: cfpAutosaveScope(slug, existingId), owner: cfpAutosaveOwner(owner) };
}

export function autosavedSelectKey(
	slug: string,
	owner: DraftOwner,
	field: string,
	existingId?: number
): string {
	return browserDraftKey(cfpSelectScope(slug, field, existingId), cfpAutosaveOwner(owner));
}

export function pendingProposalKey(slug: string): string {
	return browserDraftKey(cfpPendingScope(slug), PENDING_OWNER);
}

export function autosavedProposalKey(slug: string, owner: DraftOwner, existingId?: number): string {
	return browserDraftKey(cfpAutosaveScope(slug, existingId), cfpAutosaveOwner(owner));
}

function legacyPendingKey(slug: string): string {
	return `${LEGACY_PENDING_PREFIX}${slug}`;
}

function legacyAutosavedKey(slug: string, owner: DraftOwner): string {
	return owner ? `${LEGACY_AUTOSAVE_PREFIX}${slug}:u${owner}` : `${LEGACY_AUTOSAVE_PREFIX}${slug}`;
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

function parseProposalValue(value: unknown): ProposalDraft | null {
	const row = asRecord(value);
	if (!row) return null;
	const draft = draftFromUnknown(row);
	return isTypedProposal(draft) ? draft : null;
}

function parsePendingValue(value: unknown): PendingProposal | null {
	const row = asRecord(value);
	if (!row) return null;
	return parsePendingProposal(JSON.stringify(row));
}

function adoptLegacyPending(storage: DraftStorage, slug: string): void {
	const raw = storage.getItem(legacyPendingKey(slug));
	if (raw == null) return;
	const pending = parsePendingProposal(raw);
	if (pending) writePendingProposal(storage, slug, pending.draft, pending.intent);
	storage.removeItem(legacyPendingKey(slug));
}

function adoptLegacyAutosave(storage: DraftStorage, slug: string, owner: DraftOwner): void {
	const raw = storage.getItem(legacyAutosavedKey(slug, owner));
	if (raw == null) return;
	const saved = parseLegacyAutosaved(raw);
	if (saved) {
		writeAutosavedProposal(storage, slug, owner, saved.draft, saved.savedAt);
	}
	storage.removeItem(legacyAutosavedKey(slug, owner));
}

/** The pre-#750 envelope, or nothing: no timestamp is as good as no draft here. */
function parseLegacyAutosaved(raw: string): AutosavedProposal | null {
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

/** Read without consuming, so a failed sign-up still leaves the same-tab fallback intact. */
export function readPendingProposal(storage: DraftStorage, slug: string): PendingProposal | null {
	adoptLegacyPending(storage, slug);
	const saved = readBrowserDraft(storage, {
		scope: cfpPendingScope(slug),
		owner: PENDING_OWNER,
		baseline: '',
		parse: parsePendingValue
	});
	return saved.status === 'empty' ? null : saved.draft.value;
}

export function writePendingProposal(
	storage: DraftStorage,
	slug: string,
	draft: ProposalDraft,
	intent: PendingProposalIntent
): void {
	writeBrowserDraft(storage, {
		scope: cfpPendingScope(slug),
		owner: PENDING_OWNER,
		baseline: '',
		value: { draft, intent } satisfies PendingProposal
	});
}

export function consumePendingProposal(
	storage: DraftStorage,
	slug: string
): PendingProposal | null {
	const pending = readPendingProposal(storage, slug);
	clearBrowserDraft(storage, cfpPendingScope(slug), PENDING_OWNER);
	storage.removeItem(legacyPendingKey(slug));
	return pending;
}

/** A draft plus when it was written, so the page can say where it came from. */
export type AutosavedProposal = { draft: ProposalDraft; savedAt: number };

export function writeAutosavedProposal(
	storage: DraftStorage,
	slug: string,
	owner: DraftOwner,
	draft: ProposalDraft,
	now: number = Date.now(),
	existingId?: number
): void {
	writeBrowserDraft(storage, {
		scope: cfpAutosaveScope(slug, existingId),
		owner: cfpAutosaveOwner(owner),
		baseline: '',
		value: draft,
		now
	});
	if (existingId == null) storage.removeItem(legacyAutosavedKey(slug, owner));
}

/**
 * The first proposal's id while the call is showing the second form.
 *
 * A draft still hides that form behind Continue your draft (#815). Submitted,
 * in review, and decided already show it (#819, #868), so the second slot is
 * open without a click.
 */
export function cfpAnotherProposalId(
	existing: { id: number; status: string } | null | undefined,
	startingAnother = false
): number | undefined {
	if (!existing) return undefined;
	return existing.status !== 'draft' || startingAnother ? existing.id : undefined;
}

/**
 * The first proposal still occupies the form.
 *
 * Persist already refuses to write then (`existing && anotherId == null`).
 * Resume and the loader used `existing` instead, so a decided talk swallowed
 * the unsigned second draft (#881). Same gate, one floor up.
 */
export function cfpHasOpenProposal(
	existing: { id: number; status: string } | null | undefined,
	startingAnother = false
): boolean {
	return existing != null && cfpAnotherProposalId(existing, startingAnother) == null;
}

export type CfpResumeResult = {
	restored: ProposalDraft | null;
	restoredAt: number | null;
	fromPending: boolean;
	pendingIntent: PendingProposalIntent | null;
	startingAnother: boolean;
};

type CfpExisting = { id: number; status: string };

function emptyCfpResume(startingAnother: boolean): CfpResumeResult {
	return {
		restored: null,
		restoredAt: null,
		fromPending: false,
		pendingIntent: null,
		startingAnother
	};
}

function clearFirstAutosaveSlots(local: DraftStorage, slug: string, owner: DraftOwner): void {
	clearAutosavedProposal(local, slug, owner);
	if (owner) clearAutosavedProposal(local, slug, null);
}

function resumeFromAnotherSlot(
	local: DraftStorage,
	slug: string,
	owner: DraftOwner,
	existing: CfpExisting | null | undefined,
	startingAnother: boolean,
	now: number
): CfpResumeResult {
	if (!existing) return emptyCfpResume(startingAnother);
	const next = readAutosavedProposal(local, slug, owner, now, existing.id);
	if (!next) return emptyCfpResume(startingAnother);
	return {
		restored: next.draft,
		restoredAt: next.savedAt,
		fromPending: false,
		pendingIntent: null,
		startingAnother: existing.status === 'draft' ? true : startingAnother
	};
}

function resumeWithoutOpenProposal(
	local: DraftStorage,
	session: DraftStorage,
	slug: string,
	owner: DraftOwner,
	existing: CfpExisting | null | undefined,
	pendingProposal: PendingProposal | null,
	startingAnother: boolean,
	now: number
): CfpResumeResult {
	// Consume even when the server already handed the blob over, so the
	// same-tab copy cannot become a second later save (#643).
	const browserPending = consumePendingProposal(session, slug);
	const pending = pendingProposal ?? browserPending;
	if (pending) {
		clearAutosavedProposal(local, slug, null);
		return {
			restored: pending.draft,
			restoredAt: null,
			fromPending: true,
			pendingIntent: pending.intent,
			startingAnother
		};
	}
	if (existing) {
		clearFirstAutosaveSlots(local, slug, owner);
		return resumeFromAnotherSlot(local, slug, owner, existing, startingAnother, now);
	}
	if (owner) clearAutosavedProposal(local, slug, null);
	const saved = readAutosavedProposal(local, slug, owner, now);
	return {
		restored: saved?.draft ?? null,
		restoredAt: saved?.savedAt ?? null,
		fromPending: false,
		pendingIntent: null,
		startingAnother
	};
}

/**
 * What the public call opens after hydrate (#881).
 *
 * An open proposal keeps the existing branch: clear the first slot, then
 * reopen a typed second one. Everything else consumes the sign-in handoff
 * first. A decided talk still restores the second-slot autosave when there
 * is no handoff — that slot is the form, the first slot is the decided talk.
 */
export function resumeCfpOnMount(
	local: DraftStorage,
	session: DraftStorage,
	input: {
		slug: string;
		owner: DraftOwner;
		existing: { id: number; status: string } | null | undefined;
		pendingProposal: PendingProposal | null;
		startingAnother?: boolean;
		now?: number;
	}
): CfpResumeResult {
	const startingAnother = input.startingAnother ?? false;
	const now = input.now ?? Date.now();
	const { slug, owner, existing, pendingProposal } = input;

	if (cfpHasOpenProposal(existing, startingAnother)) {
		clearFirstAutosaveSlots(local, slug, owner);
		return resumeFromAnotherSlot(local, slug, owner, existing, startingAnother, now);
	}

	return resumeWithoutOpenProposal(
		local,
		session,
		slug,
		owner,
		existing,
		pendingProposal,
		startingAnother,
		now
	);
}

/**
 * Park what they typed, or refuse to, using the same gate the public call uses.
 *
 * A server copy used to mean "do not park". That is true while the first
 * proposal still hides the form. It is a lie once the form is the second one
 * (#815, #819, #868).
 */
export function persistCfpDraft(
	storage: DraftStorage,
	input: {
		slug: string;
		owner: DraftOwner;
		existing: { id: number; status: string } | null | undefined;
		startingAnother?: boolean;
		now?: number;
	},
	draft: ProposalDraft
): void {
	const anotherId = cfpAnotherProposalId(input.existing, input.startingAnother ?? false);
	if (input.existing && anotherId == null) return;
	if (!isTypedProposal(draft)) {
		clearAutosavedProposal(storage, input.slug, input.owner, anotherId);
		return;
	}
	writeAutosavedProposal(
		storage,
		input.slug,
		input.owner,
		draft,
		input.now ?? Date.now(),
		anotherId
	);
}

/**
 * Read without removing — coming back a second time must still find it.
 *
 * A pre-#750 copy is adopted once into the shared helper. A pre-#505 bare
 * draft (no `savedAt`) is still deleted rather than restored.
 */
export function readAutosavedProposal(
	storage: DraftStorage,
	slug: string,
	owner: DraftOwner,
	now: number = Date.now(),
	existingId?: number
): AutosavedProposal | null {
	if (existingId == null) adoptLegacyAutosave(storage, slug, owner);
	const saved = readBrowserDraft(storage, {
		scope: cfpAutosaveScope(slug, existingId),
		owner: cfpAutosaveOwner(owner),
		baseline: '',
		parse: parseProposalValue,
		now
	});
	if (saved.status === 'empty') return null;
	return { draft: saved.draft.value, savedAt: saved.draft.savedAt };
}

export function clearAutosavedProposal(
	storage: Pick<Storage, 'removeItem'>,
	slug: string,
	owner: DraftOwner,
	existingId?: number
): void {
	const identity = cfpAutosaveOwner(owner);
	clearBrowserDraft(storage, cfpAutosaveScope(slug, existingId), identity);
	for (const field of CFP_SELECT_FIELDS) {
		clearBrowserDraft(storage, cfpSelectScope(slug, field, existingId), identity);
	}
	if (existingId == null) storage.removeItem(legacyAutosavedKey(slug, owner));
}

/**
 * Everything this module ever parked, and every other account-owned form
 * draft in the same store.
 *
 * Signing out is the moment a browser stops being one person's, so it is the
 * moment the typed name, email and bio stop being fair game for whoever sits
 * down next. The shared helper is the logout boundary now; the prefix scan
 * only remains so a leftover pre-#750 key cannot outlive the session.
 */
export function clearProposalDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
	const keys: string[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (key && (key.startsWith(LEGACY_AUTOSAVE_PREFIX) || key.startsWith(LEGACY_PENDING_PREFIX))) {
			keys.push(key);
		}
	}
	for (const key of keys) storage.removeItem(key);
	clearBrowserDrafts(storage);
}
