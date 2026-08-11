/**
 * The goose easter egg's one-time "welcome back" flag: set by the login page
 * right before it redirects, consumed by the protected layout on next mount so
 * it fires once per sign-in regardless of where `returnTo` lands the user.
 * Takes a storage-like object (not the `sessionStorage` global directly) so the
 * decision logic is testable without a browser.
 */
const KEY = 'goose-welcome-back';

export function markGooseWelcome(storage: Pick<Storage, 'setItem'>): void {
	storage.setItem(KEY, '1');
}

export function consumeGooseWelcome(storage: Pick<Storage, 'getItem' | 'removeItem'>): boolean {
	if (storage.getItem(KEY) !== '1') return false;
	storage.removeItem(KEY);
	return true;
}
