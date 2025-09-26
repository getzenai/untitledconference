import { createLogger } from '$lib/server/logger';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { accountSettingsSchema } from './schema';

const logger = createLogger('AccountSettings');

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	logger.info('Account settings page accessed', {
		userId: user?.id,
		email: user?.email,
		ip: locals.ip,
		userAgent: locals.userAgent
	});

	const form = await superValidate(zod(accountSettingsSchema));
	return { form };
};
