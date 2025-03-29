import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { findUserByEmail } from '$lib/server/db/users';
import { verify } from '@node-rs/argon2';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, RequestEvent } from './$types';

// Create wrapper for setSessionTokenCookie that only requires cookies
function setCookie(cookies: RequestEvent['cookies'], token: string, expiresAt: Date) {
	setSessionTokenCookie({ cookies } as RequestEvent, token, expiresAt);
}

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		console.log('[Login] Received request');
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');
		console.log('[Login] Form data received');

		if (!email || !password) {
			console.error('[Login] Missing fields');
			return fail(400, { error: 'Missing email or password', email });
		}

		if (typeof email !== 'string' || typeof password !== 'string') {
			console.error('[Login] Invalid field types');
			return fail(400, { error: 'Invalid form data', email });
		}

		try {
			console.log('[Login] Finding user by email');
			const user = await findUserByEmail(email);

			if (!user) {
				console.warn('[Login] User not found');
				return fail(400, { error: 'Invalid credentials', email });
			}
			console.log('[Login] User found');

			console.log('[Login] Verifying password');
			const validPassword = await verify(user.passwordHash, password, {
				memoryCost: 19456,
				timeCost: 2,
				outputLen: 32,
				parallelism: 1
			});

			if (!validPassword) {
				console.warn('[Login] Invalid password');
				return fail(400, { error: 'Invalid credentials', email });
			}
			console.log('[Login] Password verified');

			console.log('[Login] Creating session');
			const token = generateSessionToken();
			const session = await createSession(token, user.id);
			console.log('[Login] Session created');

			console.log('[Login] Setting session cookie');
			setCookie(cookies, token, session.expiresAt);
		} catch (error) {
			console.error('[Login] Error during login:', error);
			return fail(500, { error: 'An error occurred during login', email });
		}

		const returnTo = url.searchParams.get('returnTo') || '/';
		return redirect(303, returnTo);
	}
};
