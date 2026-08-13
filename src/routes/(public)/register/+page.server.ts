/**
 * Registering when the page has not hydrated yet.
 *
 * Same shape as `/login` (#221): the form is a real POST so an unhydrated submit
 * does not put the password in the query string. Until this action existed,
 * SvelteKit answered that POST with `405 Method Not Allowed`. Login already had
 * the path; register did not.
 *
 * The handler, not `auth.api.signUpEmail`: Better Auth's rate limiter lives in
 * the handler, and a fix for a status code must not open an unthrottled path
 * next to a throttled one.
 */
import { auth } from '$lib/auth';
import { applySetCookies } from '$lib/server/set-cookie';
import { registrationEmailSchema } from '$lib/validators/email';
import { passwordSchema } from '$lib/validators/password';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { Actions } from './$types';

/**
 * Sync subset of `registerSchema`. The client schema's strength check is async
 * (zxcvbn) and is guidance for a hydrated form — an unhydrated submit never
 * saw it, so this asks for an address and a password of the right length, then
 * lets Better Auth decide the rest.
 */
const registerActionSchema = z.object({
	email: registrationEmailSchema,
	password: passwordSchema,
	invitationCode: z.string().optional()
});

type AuthBody = { message?: string; code?: string; token?: string | null };

async function bodyOf(response: Response): Promise<AuthBody> {
	try {
		return (await response.json()) as AuthBody;
	} catch {
		return {};
	}
}

export const actions: Actions = {
	default: async ({ request, url, cookies }) => {
		const form = await request.formData();
		const parsed = registerActionSchema.safeParse({
			email: String(form.get('email') ?? ''),
			password: String(form.get('password') ?? ''),
			invitationCode: String(form.get('invitationCode') ?? '') || undefined
		});

		if (!parsed.success) {
			return fail(400, {
				message: 'Enter an email address and a password of at least 8 characters.'
			});
		}

		const headers = new Headers(request.headers);
		headers.set('content-type', 'application/json');
		headers.delete('content-length');

		const response = await auth.handler(
			new Request(new URL('/api/auth/sign-up/email', url.origin), {
				method: 'POST',
				headers,
				body: JSON.stringify({
					email: parsed.data.email,
					password: parsed.data.password,
					name: ''
				})
			})
		);

		const body = await bodyOf(response);

		if (!response.ok) {
			if (response.status === 429) {
				return fail(429, { message: 'Too many attempts. Wait a moment and try again.' });
			}
			const already =
				body.code?.includes('ALREADY') ||
				body.message?.toLowerCase().includes('already') ||
				body.message?.toLowerCase().includes('exists');
			return fail(response.status === 400 ? 400 : response.status, {
				message: already
					? 'User already exists. Use another email.'
					: body.message || 'Registration failed. Please try again.'
			});
		}

		applySetCookies(cookies, response.headers);

		// Invitation is extra: the account exists either way, same as the hydrated path.
		if (parsed.data.invitationCode && body.token) {
			try {
				const cookieHeader = response.headers
					.getSetCookie()
					.map((header) => header.split(';')[0])
					.join('; ');
				const inviteHeaders = new Headers(request.headers);
				if (cookieHeader) inviteHeaders.set('cookie', cookieHeader);
				await auth.api.acceptInvitation({
					headers: inviteHeaders,
					body: { invitationId: parsed.data.invitationCode }
				});
			} catch {
				// They can accept from /onboarding/invitations.
			}
		}

		// A token means Better Auth created a session. No token means this
		// deployment gates on email verification — same fork the client takes.
		if (body.token) {
			redirect(303, '/home');
		}
		redirect(303, `/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
	}
};
