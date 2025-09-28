import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { createLogger } from '$lib/server/logger';
import { like } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { completeRegistrationSchema } from './schema';

const logger = createLogger('CompleteRegistration');

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';

	logger.info('Complete registration page accessed', {
		hasToken: !!token,
		tokenLength: token.length
	});

	// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms zod4 adapter
	const form = await superValidate(zod4(completeRegistrationSchema));

	// Pre-fill the token in the form
	(form.data as { token?: string }).token = token;

	// Validate the token and get the email
	let email = '';
	let isValidToken = false;

	if (token) {
		try {
			// Find the invitation by token in the resetLink path
			// The URL format is: /api/auth/reset-password/{token}?callbackURL=...
			const invitations = await db
				.select()
				.from(schema.systemInvitation)
				.where(like(schema.systemInvitation.resetLink, `%/reset-password/${token}?%`))
				.limit(1);

			if (invitations.length > 0) {
				email = invitations[0].email;
				isValidToken = true;
				logger.info('Valid invitation token found', {
					email,
					tokenPrefix: token.substring(0, 8) + '...'
				});
			} else {
				logger.warn('Invalid or expired invitation token', {
					tokenPrefix: token.substring(0, 8) + '...'
				});
			}
		} catch (error) {
			logger.error('Error validating invitation token', error as Error, {
				tokenPrefix: token.substring(0, 8) + '...'
			});
		}
	}

	return {
		form,
		token,
		email,
		isValidToken
	};
};
