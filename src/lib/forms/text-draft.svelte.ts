/**
 * One text field, wired to `browser-draft` (#763, #764, #765).
 *
 * This is a *binding*, not a second draft store: it owns no key format, no
 * envelope and no expiry — it calls `readBrowserDraft` / `writeBrowserDraft` /
 * `clearBrowserDraft` and turns their result into runes. Everything about how
 * a draft is keyed, aged and claimed stays in `browser-draft.ts`, so the two
 * worries that module was built around — a key that carries the identity, and
 * a conflict surfaced instead of a silent restore — cannot drift here.
 *
 * It exists because three pages need the same six lines of effect wiring, and
 * three copies of effect wiring is how the copies stop agreeing.
 *
 * `localStorage` is read lazily and only in the browser: this module is
 * imported by SSR'd pages.
 */
import { browser } from '$app/environment';
import { clearBrowserDraft, readBrowserDraft, writeBrowserDraft } from './browser-draft';

export type TextDraftOptions = {
	/** Which form this belongs to. Include the record id when there is one. */
	scope: string;
	/** The account the text belongs to, so a shared browser cannot leak it. */
	owner: string;
	/** The server's current text, if the field edits something that exists. */
	baseline?: string;
};

const parseText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export class TextDraft {
	#options: () => TextDraftOptions;
	#value = $state('');
	#restored = $state(false);
	#conflict = $state<{ value: string; savedAt: number } | null>(null);

	constructor(options: () => TextDraftOptions) {
		this.#options = options;
		this.#value = options().baseline ?? '';

		// Restore once. Reading also claims the identity, which is what drops a
		// previous account's copy before this one starts typing.
		$effect(() => {
			if (!browser || this.#restored) return;
			const { scope, owner, baseline } = this.#options();
			const read = readBrowserDraft<string>(localStorage, {
				scope,
				owner,
				baseline: baseline ?? '',
				parse: parseText
			});
			if (read.status === 'current') this.#value = read.draft.value;
			// A draft typed from an older server version is offered, never applied:
			// the page shows both and the person picks. Silently restoring it would
			// turn "your text survived" into "your colleague's edit is gone".
			if (read.status === 'conflict') {
				this.#conflict = { value: read.draft.value, savedAt: read.draft.savedAt };
			}
			this.#restored = true;
		});

		// Persist every keystroke, and stop persisting once the text matches the
		// server again — an empty draft is not worth keeping and would outlive
		// the edit that undid it.
		$effect(() => {
			if (!browser || !this.#restored) return;
			const { scope, owner, baseline } = this.#options();
			const value = this.#value;
			if (value === (baseline ?? '')) {
				clearBrowserDraft(localStorage, scope, owner);
				return;
			}
			writeBrowserDraft(localStorage, { scope, owner, baseline: baseline ?? '', value });
		});
	}

	get value(): string {
		return this.#value;
	}

	set value(next: string) {
		this.#value = next;
	}

	/** True while the field holds something the server has not seen. */
	get dirty(): boolean {
		return this.#value !== (this.#options().baseline ?? '');
	}

	/** A draft typed against an older server version, waiting for a decision. */
	get conflict(): { value: string; savedAt: number } | null {
		return this.#conflict;
	}

	/** Take the offered draft. */
	acceptConflict(): void {
		if (!this.#conflict) return;
		this.#value = this.#conflict.value;
		this.#conflict = null;
	}

	/** Keep what the server has and drop the copy. */
	discardConflict(): void {
		this.#conflict = null;
		const { scope, owner } = this.#options();
		if (browser) clearBrowserDraft(localStorage, scope, owner);
	}

	/** The work reached the server: the safety copy has done its job. */
	clear(): void {
		const { scope, owner, baseline } = this.#options();
		this.#value = baseline ?? '';
		this.#conflict = null;
		if (browser) clearBrowserDraft(localStorage, scope, owner);
	}
}

export function textDraft(options: () => TextDraftOptions): TextDraft {
	return new TextDraft(options);
}
