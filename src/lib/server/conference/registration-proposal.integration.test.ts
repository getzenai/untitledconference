import { emptyProposal } from '$lib/conference/proposal-draft';
import { db } from '$lib/server/db';
import { user, verification } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	clearRegistrationProposal,
	parkRegistrationProposal,
	registrationProposalForUser
} from './registration-proposal';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userId = `registration-proposal-${suffix}`;

const adapter = {
	deleteVerificationByIdentifier: async (identifier: string) => {
		await db.delete(verification).where(eq(verification.identifier, identifier));
	},
	createVerificationValue: async (value: {
		identifier: string;
		value: string;
		expiresAt: Date;
	}) => {
		const now = new Date();
		return db
			.insert(verification)
			.values({ id: nanoid(), ...value, createdAt: now, updatedAt: now })
			.returning();
	}
};

const draft = {
	...emptyProposal(),
	title: 'Across the verification tab',
	abstract: 'The browser storage is gone, but the words are not.'
};

describe('registration proposal handoff', () => {
	beforeAll(async () => {
		await db.insert(user).values({
			id: userId,
			email: `${userId}@example.test`,
			emailVerified: false,
			name: 'Ada'
		});
	});

	afterAll(async () => {
		await clearRegistrationProposal(userId, 'devflow');
		await db.delete(user).where(eq(user.id, userId));
	});

	it('binds the sign-up body to the created user and call', async () => {
		await parkRegistrationProposal(adapter, userId, {
			slug: 'devflow',
			draft,
			intent: 'draft'
		});

		expect(await registrationProposalForUser(userId, 'devflow')).toEqual({
			draft,
			intent: 'draft'
		});
		expect(await registrationProposalForUser('somebody-else', 'devflow')).toBeNull();
		expect(await registrationProposalForUser(userId, 'another-call')).toBeNull();
	});

	it('removes the handoff only after the durable save', async () => {
		await clearRegistrationProposal(userId, 'devflow');
		expect(await registrationProposalForUser(userId, 'devflow')).toBeNull();
	});

	it('drops an expired handoff instead of restoring it', async () => {
		const wroteAt = new Date('2026-01-01T00:00:00Z');
		await parkRegistrationProposal(
			adapter,
			userId,
			{ slug: 'devflow', draft, intent: 'submit' },
			wroteAt
		);

		expect(
			await registrationProposalForUser(userId, 'devflow', new Date('2026-02-01T00:00:01Z'))
		).toBeNull();
	});
});
