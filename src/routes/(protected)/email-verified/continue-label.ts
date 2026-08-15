/**
 * The continue button on /email-verified names where it goes (#642).
 * "Dashboard" is only true when returnTo is home — the default when
 * nobody asked to come back to a specific page.
 */

export function emailVerifiedContinueLabel(
	returnTo: string,
	verb: 'Continue' | 'Go' = 'Continue'
): string {
	const dest = namedDestination(returnTo);
	return dest ? `${verb} to ${dest}` : 'Continue';
}

function namedDestination(returnTo: string): string | null {
	const path = returnTo.split(/[?#]/, 1)[0] ?? returnTo;
	if (path === '/home') return 'Dashboard';
	if (/^\/c\/[^/]+\/cfp$/.test(path)) return 'your proposal';
	return null;
}
