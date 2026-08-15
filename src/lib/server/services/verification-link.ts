/** Test-only handoff of the verification URL generated during UI sign-up. */
const HANDOFF_TTL_MS = 30_000;
const pending = new Map<string, { url: string; capturedAt: number }>();

function key(email: string): string {
	return email.trim().toLowerCase();
}

function prune(now: number): void {
	for (const [email, entry] of pending) {
		if (now - entry.capturedAt > HANDOFF_TTL_MS) pending.delete(email);
	}
}

export function captureVerificationLink(email: string, url: string, now = Date.now()): void {
	prune(now);
	pending.set(key(email), { url, capturedAt: now });
}

export function takeVerificationLink(email: string, now = Date.now()): string | null {
	const entry = pending.get(key(email));
	pending.delete(key(email));
	prune(now);
	if (!entry) return null;
	return now - entry.capturedAt > HANDOFF_TTL_MS ? null : entry.url;
}
