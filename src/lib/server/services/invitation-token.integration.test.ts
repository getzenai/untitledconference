/**
 * #395: `/complete-registration?token=…` was a wildcard oracle.
 *
 * The old lookup pasted the query parameter into a SQL `LIKE` pattern over the
 * stored reset URL, so `%` matched any pending invitation and longer patterns
 * read the real token back character by character — unauthenticated. These
 * tests hold the line that made that possible: a token is compared for
 * equality, and a pattern is just a string that matches nothing.
 */
import { db } from '$lib/server/db';
import { systemInvitation, user, verification } from '$lib/server/db/auth-schema';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveInvitationEmail } from './invitation-token';
import { createSystemInvitation } from './system-invitation';

const suffix = nanoid(8).toLowerCase();
const invitedEmail = `invited-${suffix}@example.test`;
const strangerEmail = `stranger-${suffix}@example.test`;

// A row written the way the admin typed it, before migration 0019 folded the
// case. Better Auth lowercased the matching `user.email` all along.
const legacyMixedEmail = `Legacy-${suffix}@Example.test`;

const REAL_TOKEN = `tok-${suffix}-abcdefghijklmnop`;
const EXPIRED_TOKEN = `exp-${suffix}-abcdefghijklmnop`;
const STRANGER_TOKEN = `str-${suffix}-abcdefghijklmnop`;
const LEGACY_TOKEN = `leg-${suffix}-abcdefghijklmnop`;

const userIds: string[] = [];
const verificationIds: string[] = [];
const invitationIds: string[] = [];

async function seedUser(email: string): Promise<string> {
	const id = nanoid();
	await db.insert(user).values({
		id,
		name: email,
		email,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	userIds.push(id);
	return id;
}

async function seedResetToken(token: string, userId: string, expiresAt: Date): Promise<void> {
	const id = nanoid();
	await db.insert(verification).values({
		id,
		identifier: `reset-password:${token}`,
		value: userId,
		expiresAt
	});
	verificationIds.push(id);
}

async function seedInvitation(email: string, inviterId: string): Promise<void> {
	const id = nanoid();
	await db.insert(systemInvitation).values({
		id,
		email,
		invitedBy: inviterId,
		role: 'admin',
		createdAt: new Date(),
		updatedAt: new Date()
	});
	invitationIds.push(id);
}

beforeAll(async () => {
	const inviterId = await seedUser(`inviter-${suffix}@example.test`);
	const invitedId = await seedUser(invitedEmail);
	const strangerId = await seedUser(strangerEmail);

	const inAnHour = new Date(Date.now() + 3600_000);
	const anHourAgo = new Date(Date.now() - 3600_000);

	await seedInvitation(invitedEmail, inviterId);
	await seedResetToken(REAL_TOKEN, invitedId, inAnHour);
	await seedResetToken(EXPIRED_TOKEN, invitedId, anHourAgo);
	// A normal password reset: valid token, no pending invitation.
	await seedResetToken(STRANGER_TOKEN, strangerId, inAnHour);

	const legacyId = await seedUser(legacyMixedEmail.toLowerCase());
	await seedInvitation(legacyMixedEmail, inviterId);
	await seedResetToken(LEGACY_TOKEN, legacyId, inAnHour);
});

afterAll(async () => {
	await db.delete(verification).where(inArray(verification.id, verificationIds));
	await db.delete(systemInvitation).where(inArray(systemInvitation.id, invitationIds));
	for (const id of userIds) await db.delete(user).where(eq(user.id, id));
});

describe('resolveInvitationEmail', () => {
	it('resolves the invited email for the exact token', async () => {
		await expect(resolveInvitationEmail(REAL_TOKEN)).resolves.toBe(invitedEmail);
	});

	it('gives nothing away to LIKE wildcards', async () => {
		// Each of these matched under the old `like('%/reset-password/' + token + '?%')`.
		const patterns = [
			'%',
			'%%',
			'_',
			`${REAL_TOKEN.slice(0, 4)}%`,
			`%${REAL_TOKEN.slice(4, 10)}%`,
			REAL_TOKEN.slice(0, -1) + '_'
		];
		for (const pattern of patterns) {
			await expect(resolveInvitationEmail(pattern), pattern).resolves.toBeNull();
		}
	});

	it('refuses an expired token', async () => {
		await expect(resolveInvitationEmail(EXPIRED_TOKEN)).resolves.toBeNull();
	});

	it('refuses a reset token that belongs to no pending invitation', async () => {
		await expect(resolveInvitationEmail(STRANGER_TOKEN)).resolves.toBeNull();
	});

	it('refuses an empty token without asking the database', async () => {
		await expect(resolveInvitationEmail('')).resolves.toBeNull();
	});

	it('stops resolving once the invitation is accepted', async () => {
		await db
			.update(systemInvitation)
			.set({ acceptedAt: new Date() })
			.where(eq(systemInvitation.email, invitedEmail));

		await expect(resolveInvitationEmail(REAL_TOKEN)).resolves.toBeNull();

		await db
			.update(systemInvitation)
			.set({ acceptedAt: null })
			.where(eq(systemInvitation.email, invitedEmail));
	});
});

/**
 * The invitation link now travels over the two email columns instead of over
 * the dropped `reset_link`, and those columns did not agree: Better Auth
 * lowercases `user.email`, our invitation row kept what the admin typed. An
 * admin who invited `Ada@Example.test` got a link that dropped the invitee on
 * /login. Found in review of #395.
 */
describe('invitations whose email was not lowercased', () => {
	it('resolves a row written before the case was normalized', async () => {
		await expect(resolveInvitationEmail(LEGACY_TOKEN)).resolves.toBe(
			legacyMixedEmail.toLowerCase()
		);
	});

	it('stores a newly typed address lowercased', async () => {
		const typed = `Fresh-${suffix}@Example.test`;
		const inviterId = userIds[0];

		const created = await createSystemInvitation({ email: typed, invitedBy: inviterId });
		invitationIds.push(created.id);

		const [row] = await db
			.select({ email: systemInvitation.email })
			.from(systemInvitation)
			.where(eq(systemInvitation.id, created.id));

		expect(row.email).toBe(typed.toLowerCase());
	});
});
