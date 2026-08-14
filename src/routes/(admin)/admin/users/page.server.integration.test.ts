/**
 * `?/regenerateInvitation`, measured against the account it must not touch.
 *
 * The form carried `invitationId` and `email`, and nothing checked that the two
 * belonged together. While the action only sent a mail, that was a mail to an
 * address of the caller's choosing. Since #401 the same action **deletes** the
 * `reset-password:` rows for that address first, so a wrong `email` spends a
 * stranger's live password reset — the button became destructive without
 * gaining the one check that makes it safe (#407).
 *
 * So the assertion is about the bystander, not about the happy path: hand the
 * action a valid invitation and somebody else's address, and the somebody else
 * must still be able to reset their password afterwards.
 */
import { db } from '$lib/server/db';
import { systemInvitation, user, verification } from '$lib/server/db/auth-schema';
import { createSystemInvitation } from '$lib/server/services/system-invitation';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminId = `admin-${suffix}`;
const inviteeEmail = `invitee-${suffix}@example.test`;
const strangerEmail = `stranger-${suffix}@example.test`;
const strangerToken = `tok-${suffix}-strangers-own-reset`;

const userIds = [adminId, `invitee-${suffix}`, `stranger-${suffix}`];
let invitationId = '';

async function seedUser(id: string, email: string, role = 'user') {
	await db.insert(user).values({
		id,
		name: email,
		email,
		role,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	});
}

function regenerateEvent(id: string, email: string) {
	const body = new FormData();
	body.append('invitationId', id);
	body.append('email', email);

	return {
		request: new Request('http://localhost/admin/users?/regenerateInvitation', {
			method: 'POST',
			body
		}),
		locals: { user: { id: adminId, role: 'admin' } }
	} as unknown as Parameters<typeof actions.regenerateInvitation>[0];
}

/** The stranger's own reset, the way Better Auth stores it. */
async function strangerResetExists(): Promise<boolean> {
	const rows = await db
		.select({ id: verification.id })
		.from(verification)
		.where(eq(verification.identifier, `reset-password:${strangerToken}`));

	return rows.length === 1;
}

beforeAll(async () => {
	await seedUser(adminId, `admin-${suffix}@example.test`, 'admin');
	await seedUser(`stranger-${suffix}`, strangerEmail);

	// Invitation first, then the user row: that is the order the admin action
	// uses, and `createSystemInvitation` refuses an address that already has an
	// account.
	const invitation = await createSystemInvitation({
		email: inviteeEmail,
		invitedBy: adminId
	});
	invitationId = invitation.id;
	await seedUser(`invitee-${suffix}`, inviteeEmail);

	await db.insert(verification).values({
		id: `ver-${suffix}`,
		identifier: `reset-password:${strangerToken}`,
		value: `stranger-${suffix}`,
		expiresAt: new Date(Date.now() + 3600_000)
	});
});

afterAll(async () => {
	await db.delete(verification).where(like(verification.value, `%${suffix}`));
	await db.delete(verification).where(eq(verification.id, `ver-${suffix}`));
	await db.delete(systemInvitation).where(eq(systemInvitation.email, inviteeEmail));
	await db.delete(user).where(inArray(user.id, userIds));
});

describe('regenerating an invitation', () => {
	it('leaves a stranger named in the form alone', async () => {
		expect(await strangerResetExists()).toBe(true);

		const result = await actions.regenerateInvitation(regenerateEvent(invitationId, strangerEmail));

		// The action does its job for the invitation it was given...
		expect(result).toMatchObject({ action: 'regenerateInvitation', success: true });

		// ...and the stranger, whose only involvement was being named in a form
		// field, can still use the reset link they asked for themselves.
		expect(await strangerResetExists()).toBe(true);
	});

	it('refuses an invitation id it cannot find', async () => {
		const result = await actions.regenerateInvitation(
			regenerateEvent(`no-such-invitation-${suffix}`, inviteeEmail)
		);

		expect(result).toMatchObject({ status: 400 });
		expect(await strangerResetExists()).toBe(true);
	});
});
