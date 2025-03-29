import { fail, redirect } from '@sveltejs/kit';
import type { Actions, RequestEvent } from './$types';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import * as table from '$lib/server/db/schema';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { hash } from '@node-rs/argon2';
import { encodeBase32LowerCase } from '@oslojs/encoding';

// Create wrapper for setSessionTokenCookie that only requires cookies
function setCookie(cookies: RequestEvent['cookies'], token: string, expiresAt: Date) {
	setSessionTokenCookie({ cookies } as RequestEvent, token, expiresAt);
}

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		console.log('[Register] Received request');
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');
		console.log('[Register] Form data received');

		if (!email || !password) {
			console.error('[Register] Missing fields');
			return fail(400, { error: 'All fields are required', email });
		}

		if (typeof email !== 'string' || typeof password !== 'string') {
			console.error('[Register] Invalid field types');
			return fail(400, { error: 'Invalid form data', email });
		}

		if (!validateEmail(email)) {
			console.warn('[Register] Invalid email format');
			return fail(400, { error: 'Invalid email format', email });
		}

		if (!validatePassword(password)) {
			console.warn('[Register] Invalid password format');
			return fail(400, { error: 'Invalid password (min 6, max 255 characters)', email });
		}

		try {
			console.log('[Register] Checking for existing user');
			const [existingUser] = await db.select().from(table.user).where(eq(table.user.email, email));

			if (existingUser) {
				console.warn('[Register] Email already registered');
				return fail(400, { error: 'Email already registered', email });
			}
			console.log('[Register] Email not registered, proceeding');

			console.log('[Register] Hashing password');
			const passwordHash = await hash(password, {
				memoryCost: 19456,
				timeCost: 2,
				outputLen: 32,
				parallelism: 1
			});
			console.log('[Register] Password hashed');

			const userId = generateUserId();
			console.log('[Register] Creating new user');
			const [newUser] = await db
				.insert(table.user)
				.values({
					id: userId,
					email,
					passwordHash
				})
				.returning();
			console.log('[Register] New user created');

			console.log('[Register] Creating session');
			const token = generateSessionToken();
			const session = await createSession(token, newUser.id);
			console.log('[Register] Session created');

			console.log('[Register] Setting session cookie');
			setCookie(cookies, token, session.expiresAt);
		} catch (error) {
			console.error('[Register] Error during registration:', error);
			return fail(500, { error: 'An error occurred during registration', email });
		}

		console.log('[Register] About to redirect to home page, URL: /');
		const redirectResult = redirect(303, '/');
		console.log('[Register] Redirect result:', redirectResult);
		return redirectResult;
	}
};

function generateUserId() {
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	const id = encodeBase32LowerCase(bytes);
	return id;
}

function validateEmail(email: unknown): email is string {
	return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: unknown): password is string {
	return typeof password === 'string' && password.length >= 6 && password.length <= 255;
}
