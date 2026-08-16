/**
 * Apply a dropdown choice to the parked browser copy (#801).
 *
 * `AppSelect` can fire empty while it mounts. That fire must not wipe a
 * restored pick. A later empty choice — the user set the field back to
 * "—" — must go through and drop the key, or a reload puts the old pick
 * back on them.
 */
import { clearBrowserDraft, writeBrowserDraft } from './browser-draft';

export function chooseBrowserDraftSelect(
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
	choice: {
		mounted: boolean;
		next: string;
		value: string;
		baseline: string;
		scope: string;
		owner: string;
		conflict?: boolean;
	}
): { accepted: boolean; value: string } {
	if (!choice.mounted && choice.next === '' && choice.value) {
		return { accepted: false, value: choice.value };
	}

	const value = choice.next;
	if (choice.mounted && !choice.conflict && choice.owner && choice.scope) {
		if (value !== choice.baseline) {
			writeBrowserDraft(storage, {
				scope: choice.scope,
				owner: choice.owner,
				baseline: choice.baseline,
				value
			});
		} else {
			clearBrowserDraft(storage, choice.scope, choice.owner);
		}
	}
	return { accepted: true, value };
}
