import { INVITATION_EXPIRY_SECONDS } from '$lib/constants';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { systemInvitation, user } from '../db/auth-schema';

export interface CreateSystemInvitationParams {
	email: string;
	invitedBy: string;
	role?: string;
}

export interface SystemInvitationResponse {
	id: string;
	email: string;
	invitedBy: string;
	role: string;
}

export async function createSystemInvitation(
	params: CreateSystemInvitationParams
): Promise<SystemInvitationResponse> {
	const { email, invitedBy, role = 'user' } = params;

	// Check if user already exists
	const existingUser = await db.select().from(user).where(eq(user.email, email)).limit(1);
	if (existingUser.length > 0) {
		throw new Error('User with this email already exists');
	}

	// Check for existing pending invitation
	const existingInvitation = await db
		.select()
		.from(systemInvitation)
		.where(and(eq(systemInvitation.email, email), isNull(systemInvitation.acceptedAt)))
		.limit(1);

	const id = existingInvitation.length > 0 ? existingInvitation[0].id : nanoid();

	if (existingInvitation.length === 0) {
		// Create new invitation record
		await db.insert(systemInvitation).values({
			id,
			email,
			invitedBy,
			role,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	return {
		id,
		email,
		invitedBy,
		role
	};
}

export async function markInvitationAsAccepted(email: string): Promise<void> {
	await db
		.update(systemInvitation)
		.set({
			acceptedAt: new Date(),
			updatedAt: new Date()
		})
		.where(and(eq(systemInvitation.email, email), isNull(systemInvitation.acceptedAt)));
}

export async function validateSystemInvitation(invitationId: string) {
	// This function validates invitations by ID now
	const result = await db
		.select({
			invitation: systemInvitation,
			inviterName: user.name,
			inviterEmail: user.email
		})
		.from(systemInvitation)
		.leftJoin(user, eq(systemInvitation.invitedBy, user.id))
		.where(and(eq(systemInvitation.id, invitationId), isNull(systemInvitation.acceptedAt)))
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	const { invitation, inviterName, inviterEmail } = result[0];

	return {
		...invitation,
		inviterName: inviterName || inviterEmail || 'Unknown',
		inviterEmail: inviterEmail || 'Unknown'
	};
}

export async function listAllInvitations() {
	const invitations = await db
		.select({
			id: systemInvitation.id,
			email: systemInvitation.email,
			role: systemInvitation.role,
			invitedBy: systemInvitation.invitedBy,
			lastGeneratedAt: systemInvitation.lastGeneratedAt,
			acceptedAt: systemInvitation.acceptedAt,
			createdAt: systemInvitation.createdAt,
			inviterName: user.name,
			inviterEmail: user.email
		})
		.from(systemInvitation)
		.leftJoin(user, eq(systemInvitation.invitedBy, user.id))
		.orderBy(systemInvitation.createdAt);

	// Add expiration date based on lastGeneratedAt or createdAt
	return invitations.map((inv) => {
		const referenceDate = inv.lastGeneratedAt || inv.createdAt;
		const expiresAt = new Date(referenceDate);
		// Convert seconds to days for date calculation
		const expiryDays = INVITATION_EXPIRY_SECONDS / 86400;
		expiresAt.setDate(expiresAt.getDate() + expiryDays);
		return {
			...inv,
			expiresAt
		};
	});
}
