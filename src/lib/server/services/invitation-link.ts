/**
 * The one-time handoff of a freshly generated invitation link.
 *
 * An invitation link is a password-reset URL with the live reset token in the
 * path. Better Auth hands it to `sendResetPassword`; the admin screen that
 * asked for it needs it back so a human can copy it. The old bridge for that
 * was the database: write the whole URL to `system_invitation.reset_link` and
 * poll for it. That put a live reset token at rest for every pending
 * invitation, which is what made #395 worth attacking.
 *
 * It was never necessary. Better Auth awaits `sendResetPassword` inside
 * `requestPasswordReset` unless `advanced.backgroundTasks.handler` is
 * configured (`better-auth/dist/context/create-context.mjs`
 * `runInBackgroundOrAwait`), and we configure no such handler. So the callback
 * and the caller are the same request in the same isolate, and the link can be
 * handed over in memory: written by the callback, taken once by the action
 * that triggered it.
 *
 * If a fork ever does configure a background-task handler, the callback stops
 * being awaited and `takeInvitationLink` will return null — the admin sees
 * "the link will be available shortly" instead of a link. That is a visible
 * failure, not a silent one.
 */

/**
 * How long an untaken link stays readable. A link is normally taken
 * milliseconds after it is captured; anything older is a flow that threw
 * before it got there, and holding a live token for it buys nothing.
 */
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

/** Record the link Better Auth just generated for `email`. */
export function captureInvitationLink(email: string, url: string, now = Date.now()): void {
	prune(now);
	pending.set(key(email), { url, capturedAt: now });
}

/**
 * Read the link for `email` and forget it. Returns null when nothing was
 * captured, or when the capture is older than the handoff window.
 */
export function takeInvitationLink(email: string, now = Date.now()): string | null {
	const entry = pending.get(key(email));
	pending.delete(key(email));
	prune(now);
	if (!entry) return null;
	return now - entry.capturedAt > HANDOFF_TTL_MS ? null : entry.url;
}
