/**
 * One spelling of an email address, so two tables can be compared.
 *
 * Better Auth lowercases `user.email` on every write
 * (`better-auth/dist/db/internal-adapter.mjs`). Our own invitation row used to
 * keep whatever the admin typed. That difference was invisible while the
 * invitation link was looked up through `system_invitation.reset_link`, and
 * became a broken invitation the moment the lookup ran over the two email
 * columns (#395 review): an admin who typed `Ada@Example.test` got a link that
 * sent the invitee to /login.
 *
 * Every address we store or compare against `user.email` goes through here.
 */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}
