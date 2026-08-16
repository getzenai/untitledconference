/**
 * A same-browser safety copy for forms that have not reached the server yet.
 *
 * The scope says which form it belongs to; the owner prevents a shared browser
 * from handing one account's text to the next. The baseline identifies the
 * server version the draft was typed from, so callers can surface a conflict
 * instead of silently replacing newer saved data.
 */
const PREFIX = 'unsaved-form-draft:';
const OWNER_PREFIX = 'unsaved-form-draft-owner:';

export const BROWSER_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type BrowserDraft<T> = {
	value: T;
	savedAt: number;
	baseline: string;
};

export type BrowserDraftRead<T> =
	| { status: 'empty' }
	| { status: 'current'; draft: BrowserDraft<T> }
	| { status: 'conflict'; draft: BrowserDraft<T> };

function part(value: string): string {
	return encodeURIComponent(value);
}

export function browserDraftKey(scope: string, owner: string): string {
	return `${PREFIX}${part(scope)}:${part(owner)}`;
}

function ownerKey(scope: string): string {
	return `${OWNER_PREFIX}${part(scope)}`;
}

function removeBestEffort(storage: Pick<Storage, 'removeItem'>, key: string): void {
	try {
		storage.removeItem(key);
	} catch {
		// An unavailable safety copy must never interrupt the form itself.
	}
}

/** Remove the previous identity's copy before this browser starts using the form as someone else. */
function claimIdentity(
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
	scope: string,
	owner: string
): void {
	const key = ownerKey(scope);
	const previous = storage.getItem(key);
	if (previous && previous !== owner) storage.removeItem(browserDraftKey(scope, previous));
	storage.setItem(key, owner);
}

export function writeBrowserDraft<T>(
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
	options: {
		scope: string;
		owner: string;
		baseline: string;
		value: T;
		now?: number;
	}
): void {
	const serialized = JSON.stringify({
		value: options.value,
		baseline: options.baseline,
		savedAt: options.now ?? Date.now()
	} satisfies BrowserDraft<T>);

	try {
		claimIdentity(storage, options.scope, options.owner);
		storage.setItem(browserDraftKey(options.scope, options.owner), serialized);
	} catch {
		// Browser storage is best-effort. A quota or privacy-mode refusal may
		// remove the safety copy; it must never interrupt the form itself.
	}
}

function parseEnvelope<T>(
	raw: string,
	parse: (value: unknown) => T | null,
	now: number
): BrowserDraft<T> | null {
	const envelope = JSON.parse(raw) as Record<string, unknown>;
	const value = parse(envelope.value);
	const savedAt = typeof envelope.savedAt === 'number' ? envelope.savedAt : NaN;
	const baseline = typeof envelope.baseline === 'string' ? envelope.baseline : null;
	// `baseline === null`, not `!baseline`: the empty string is the *normal*
	// baseline for a form that creates something rather than edits it, and
	// falsiness threw those drafts away — silently, and by deleting the key on
	// the way out. Every add dialog and invite field has no server version.
	if (
		value === null ||
		!Number.isFinite(savedAt) ||
		baseline === null ||
		now - savedAt > BROWSER_DRAFT_MAX_AGE_MS
	) {
		return null;
	}
	return { value, savedAt, baseline };
}

export function readBrowserDraft<T>(
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
	options: {
		scope: string;
		owner: string;
		baseline: string;
		parse: (value: unknown) => T | null;
		now?: number;
	}
): BrowserDraftRead<T> {
	try {
		claimIdentity(storage, options.scope, options.owner);
		const key = browserDraftKey(options.scope, options.owner);
		const raw = storage.getItem(key);
		if (raw == null) return { status: 'empty' };

		try {
			const draft = parseEnvelope(raw, options.parse, options.now ?? Date.now());
			if (!draft) {
				removeBestEffort(storage, key);
				return { status: 'empty' };
			}
			return draft.baseline === options.baseline
				? { status: 'current', draft }
				: { status: 'conflict', draft };
		} catch {
			removeBestEffort(storage, key);
			return { status: 'empty' };
		}
	} catch {
		// `getItem`, identity claiming and cleanup can all be refused by the
		// browser. Treat an unavailable safety copy exactly like no copy.
		return { status: 'empty' };
	}
}

export function clearBrowserDraft(
	storage: Pick<Storage, 'removeItem'>,
	scope: string,
	owner: string
): void {
	removeBestEffort(storage, browserDraftKey(scope, owner));
}

/** Logout boundary: no account-owned form text remains for the next browser user. */
export function clearBrowserDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
	try {
		for (let index = storage.length - 1; index >= 0; index -= 1) {
			const key = storage.key(index);
			if (key?.startsWith(PREFIX) || key?.startsWith(OWNER_PREFIX)) storage.removeItem(key);
		}
	} catch {
		// Logout continues even when this browser does not expose storage.
	}
}
