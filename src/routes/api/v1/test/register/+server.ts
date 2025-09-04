import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
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
		let result = await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: '' // Empty name as required by the schema
			}
		});

		console.log('[Test Register API] User creation result:', {
			userCreated: !!result.user,
			userId: result.user?.id,
			hasHeaders: !!(result as Record<string, unknown>).headers
		});

		// If user creation failed but user exists, try to sign in
		if (!result.user) {
			console.log('[Test Register API] User creation failed, attempting sign in...');
			const signInResult = await auth.api.signInEmail({
				body: {
					email,
					password
				}
			});

			if (signInResult.user) {
				result = signInResult;
				console.log('[Test Register API] Sign in successful for existing user');
			}
		}

		// Better Auth returns user directly on success
		if (result.user) {
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

					// Set this organization as active using Better Auth API
					try {
						await auth.api.setActiveOrganization({
							body: {
								organizationId: organization.id
							},
							headers: request.headers
						});
						console.log(`[Test Register API] Set active organization: ${organization.name}`);
					} catch (setActiveError) {
						console.error('[Test Register API] Failed to set active organization:', setActiveError);
					}

					console.log(`[Test Register API] User already has organization: ${organization.name}`);
				} else {
					// Create new organization for the test user with unique slug
					const orgId = nanoid();
					const timestamp = Date.now();
					const baseSlug = orgNameToUse
						.toLowerCase()
						.replace(/\s+/g, '-')
						.replace(/[^a-z0-9-]/g, '');
					const orgSlug = `${baseSlug}-${timestamp}`; // Make slug unique with timestamp

					// Insert organization
					await db.insert(schema.organization).values({
						id: orgId,
						name: orgNameToUse,
						slug: orgSlug
					});

					// Add user as admin member
					const memberId = nanoid();
					await db.insert(schema.member).values({
						id: memberId,
						organizationId: orgId,
						userId: result.user.id,
						role: 'admin'
					});

					// Set the organization as active using Better Auth API
					try {
						await auth.api.setActiveOrganization({
							body: {
								organizationId: orgId
							},
							headers: request.headers
						});
						console.log(`[Test Register API] Set active organization: ${orgNameToUse}`);
					} catch (setActiveError) {
						console.error('[Test Register API] Failed to set active organization:', setActiveError);
					}

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
