import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ request }) => {
	console.log('[Test Register API] =========================');
	console.log('[Test Register API] Starting registration process');

	try {
		const { email, password, organizationName } = await request.json();

		console.log('[Test Register API] Request received:', { email, organizationName });

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Try to create the user first
		// Pass headers to ensure proper request context
		let result: { user?: { id: string; email: string } | null };
		try {
			result = await auth.api.signUpEmail({
				body: {
					email,
					password,
					name: '' // Empty name as required by the schema
				},
				headers: request.headers
			});

			console.log('[Test Register API] User creation result:', {
				userCreated: !!result.user,
				userId: result.user?.id,
				hasHeaders: !!(result as Record<string, unknown>).headers
			});
		} catch (signUpError) {
			console.log(
				'[Test Register API] Error:',
				signUpError instanceof Error ? signUpError.message : String(signUpError)
			);
			result = { user: null };
		}

		// If user creation failed but user exists, try to sign in
		if (!result?.user) {
			console.log('[Test Register API] User creation failed, attempting sign in...');
			try {
				const signInResult = await auth.api.signInEmail({
					body: {
						email,
						password
					},
					headers: request.headers
				});

				if (signInResult.user) {
					result = signInResult;
					console.log('[Test Register API] Sign in successful for existing user');
				}
			} catch (signInError) {
				const errorMessage =
					signInError instanceof Error ? signInError.message : String(signInError);
				console.error('[Test Register API] Sign in also failed:', errorMessage);
				// Return a failed registration response
				return json({ error: 'User creation and sign in failed' }, { status: 400 });
			}
		}

		// Better Auth returns user directly on success
		if (result.user) {
			// Verify the user actually exists in the database
			const userExists = await db
				.select({ id: schema.user.id })
				.from(schema.user)
				.where(eq(schema.user.id, result.user.id))
				.limit(1);

			if (userExists.length === 0) {
				console.error(
					'[Test Register API] User not found in database after creation:',
					result.user.id
				);
				return json({ error: 'User creation incomplete' }, { status: 500 });
			}

			// Check if this is the first user and make them admin
			const userCount = await db.select({ count: count() }).from(schema.user);

			if (userCount[0].count === 1) {
				// This is the first user, make them admin
				console.log('[Test Register API] First user detected, setting as admin');
				await db
					.update(schema.user)
					.set({ role: 'admin' })
					.where(eq(schema.user.id, result.user.id));
			}

			let organization = null;

			// Always ensure organization exists for test users (all test users should have an org)
			// Use provided organization name or default
			const orgNameToUse = organizationName || 'Test Organization';
			console.log('[Test Register API] Ensuring organization exists:', orgNameToUse);

			try {
				// For test users, we'll create the organization directly in the database
				// since Better Auth API doesn't return headers for server-side calls

				// Check if user already has an organization
				const existingMemberships = await db
					.select({
						orgId: schema.organization.id,
						orgName: schema.organization.name,
						role: schema.member.role
					})
					.from(schema.member)
					.innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
					.where(eq(schema.member.userId, result.user.id));

				if (existingMemberships.length > 0) {
					// User already has an organization
					organization = {
						id: existingMemberships[0].orgId,
						name: existingMemberships[0].orgName
					};

					// Note: Active organization is set at the session level when the user logs in
					// We don't need to set it here for test users
					console.log(`[Test Register API] User already has organization: ${organization.name}`);
				} else {
					// Create new organization for the test user with unique slug
					const orgId = nanoid();
					const timestamp = Date.now();
					const randomSuffix = nanoid(6).toLowerCase(); // Add random suffix for extra uniqueness
					const baseSlug = orgNameToUse
						.toLowerCase()
						.replace(/\s+/g, '-')
						.replace(/[^a-z0-9-]/g, '');
					const orgSlug = `${baseSlug}-${timestamp}-${randomSuffix}`; // Make slug unique with timestamp and random suffix

					// Insert organization first
					await db.insert(schema.organization).values({
						id: orgId,
						name: orgNameToUse,
						slug: orgSlug
					});

					// Add user as owner member (creator should be owner, not admin)
					// Wrap in try-catch to handle potential race conditions
					try {
						const memberId = nanoid();
						await db.insert(schema.member).values({
							id: memberId,
							organizationId: orgId,
							userId: result.user.id,
							role: 'owner'
						});
					} catch (memberError) {
						console.error('[Test Register API] Error adding member:', memberError);
						// Organization was created but member addition failed
						// This is okay for test purposes
					}

					// Note: Active organization is set at the session level when the user logs in
					// We don't need to set it here for test users
					console.log(`[Test Register API] Created organization: ${orgNameToUse}`);

					organization = {
						id: orgId,
						name: orgNameToUse
					};

					console.log(
						`[Test Register API] Successfully created organization: ${organization.name}`
					);
				}
			} catch (orgError) {
				console.error(
					'[Test Register API] Error creating organization:',
					JSON.stringify(orgError, null, 2)
				);
				// Don't fail the user creation if org creation fails
			}

			console.log('[Test Register API] Final response:', {
				hasUser: !!result.user,
				hasOrg: !!organization,
				orgName: organization?.name,
				orgId: organization?.id
			});

			return json({
				success: true,
				user: {
					id: result.user.id,
					email: result.user.email
				},
				organization
			});
		} else {
			return json({ error: 'Registration failed' }, { status: 400 });
		}
	} catch (error) {
		console.error('[Test Register API] Error:', error);
		return json({ error: 'Registration failed' }, { status: 500 });
	}
};
