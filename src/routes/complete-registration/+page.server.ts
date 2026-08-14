import { createLogger } from '$lib/server/logger';
import { resolveInvitationEmail } from '$lib/server/services/invitation-token';
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

	const form = await superValidate(zod4(completeRegistrationSchema));

	// Pre-fill the token in the form
	(form.data as { token?: string }).token = token;

	// The email is only known to a caller who already holds the exact token.
	// See `resolveInvitationEmail` for why this is not a search.
	let email = '';
	let isValidToken = false;

	if (token) {
		try {
			const resolved = await resolveInvitationEmail(token);
			if (resolved) {
				email = resolved;
				isValidToken = true;
				logger.info('Valid invitation token found', { email });
			} else {
				logger.warn('Invalid or expired invitation token');
			}
		} catch (error) {
			logger.error('Error validating invitation token', error as Error);
		}
	}

	return {
		form,
		token,
		email,
		isValidToken
	};
};
