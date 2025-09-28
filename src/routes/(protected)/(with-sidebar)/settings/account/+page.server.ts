import { createLogger } from '$lib/server/logger';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
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

	// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms zod4 adapter
	const form = await superValidate(zod4(accountSettingsSchema));
	return { form };
};
