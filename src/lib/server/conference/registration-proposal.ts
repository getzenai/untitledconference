/** Server-side handoff for a proposal typed before account creation (#643). */
import {
	DRAFT_MAX_AGE_MS,
	parsePendingProposal,
	parseRegistrationProposal,
	type PendingProposal
} from '$lib/conference/pending-proposal';
import { db } from '$lib/server/db';
import { verification } from '$lib/server/db/auth-schema';
import { desc, eq } from 'drizzle-orm';

const PREFIX = 'cfp-registration-proposal:';

type VerificationWriter = {
	createVerificationValue(data: {
		identifier: string;
		value: string;
		expiresAt: Date;
	}): Promise<unknown>;
	deleteVerificationByIdentifier(identifier: string): Promise<void>;
};

function identifier(userId: string, slug: string): string {
	return `${PREFIX}${userId}:${slug}`;
}

/**
 * Called from Better Auth's user-create hook, inside the sign-up transaction.
 * The row is keyed to the user Better Auth actually created, never to an id or
 * address supplied by the browser.
 */
export async function parkRegistrationProposal(
	adapter: VerificationWriter,
	userId: string,
	value: unknown,
	now = new Date()
): Promise<void> {
	const proposal = parseRegistrationProposal(value);
	if (!proposal) return;

	const key = identifier(userId, proposal.slug);
	await adapter.deleteVerificationByIdentifier(key);
	await adapter.createVerificationValue({
		identifier: key,
		value: JSON.stringify({ draft: proposal.draft, intent: proposal.intent }),
		expiresAt: new Date(now.getTime() + DRAFT_MAX_AGE_MS)
	});
}

/** Only the signed-in account named in the key can retrieve this copy. */
export async function registrationProposalForUser(
	userId: string,
	slug: string,
	now = new Date()
): Promise<PendingProposal | null> {
	const key = identifier(userId, slug);
	const [row] = await db
		.select({ value: verification.value, expiresAt: verification.expiresAt })
		.from(verification)
		.where(eq(verification.identifier, key))
		.orderBy(desc(verification.updatedAt), desc(verification.id))
		.limit(1);

	if (!row) return null;
	if (row.expiresAt <= now) {
		await db.delete(verification).where(eq(verification.identifier, key));
		return null;
	}
	return parsePendingProposal(row.value);
}

/** A successful save is the durable copy; the handoff has finished its job. */
export async function clearRegistrationProposal(userId: string, slug: string): Promise<void> {
	await db.delete(verification).where(eq(verification.identifier, identifier(userId, slug)));
}
