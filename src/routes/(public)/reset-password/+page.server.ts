import { auth } from '$lib/auth';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';

	return { token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const password = formData.get('password');
		const token = formData.get('token');

		if (typeof password !== 'string' || password.length === 0) {
			return fail(400, { error: 'Password is required' });
		}

		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		if (typeof token !== 'string' || token.length === 0) {
			return fail(400, {
				error: 'This reset link is invalid or has expired. Please request a new one.'
			});
		}

		try {
			await auth.api.resetPassword({
				body: {
					newPassword: password,
					token
				},
				headers: request.headers
			});

			return { success: true };
		} catch (error) {
			console.error('[Reset Password] Failed to reset password:', error);
			return fail(400, {
				error: 'This reset link is invalid or has expired. Please request a new one.'
			});
		}
	}
};
