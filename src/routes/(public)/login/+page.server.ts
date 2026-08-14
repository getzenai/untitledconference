/**
 * Signing in when the page has not hydrated yet (#221).
 *
 * The form is a real POST form on purpose — before Svelte hydrates, superForm's
 * `SPA: true` cancels nothing and the browser navigates natively to `/login`. Until
 * now there was no action here, so SvelteKit answered that POST the only way it can
 * without one: `405 Method Not Allowed`, rendered as a page. It looked sporadic
 * because it only catches whoever submits before the JavaScript is ready — right
 * after a deploy, on a slow connection, or from a script that types faster than a
 * person.
 *
 * The fix is not a nicer error. It is the same sign-in, done on the server: the
 * unhydrated submit signs the person in and lands them where the hydrated one would.
 *
 * And it is *literally* the same sign-in — this hands the request to `auth.handler`,
 * the endpoint `authClient.signIn.email` posts to, rather than calling
 * `auth.api.signInEmail` directly. Better Auth's rate limiter lives in the handler,
 * so the direct call would have given the browser three attempts per ten seconds and
 * this form unlimited ones: a brute-force path opened by the fix for a status code.
 */
import { auth } from '$lib/auth';
import { safeReturnTo } from '$lib/safe-return-to';
import { applySetCookies } from '$lib/server/set-cookie';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { loginSchema } from './schema';

/** What Better Auth puts in a failed response body. */
type AuthErrorBody = { message?: string; code?: string };

async function errorBody(response: Response): Promise<AuthErrorBody> {
	try {
		return (await response.json()) as AuthErrorBody;
	} catch {
		return {};
	}
}

export const actions: Actions = {
	default: async ({ request, url, cookies }) => {
		const form = await request.formData();
		const parsed = loginSchema.safeParse({
			email: String(form.get('email') ?? ''),
			password: String(form.get('password') ?? ''),
			rememberMe: form.get('rememberMe') === 'on'
		});

		// The client validates the same schema before it ever posts, so a submit that
		// arrives here unvalidated is the unhydrated one: it says what is missing
		// rather than quoting a validator at somebody who never saw it.
		if (!parsed.success) {
			return fail(400, { message: 'Enter your email address and password.' });
		}

		const returnTo = safeReturnTo(url.searchParams.get('returnTo'), url.origin);

		// The original headers ride along: the rate limiter reads the client address
		// off them, and Better Auth checks `Origin` against its trusted list.
		const headers = new Headers(request.headers);
		headers.set('content-type', 'application/json');
		headers.delete('content-length');

		const response = await auth.handler(
			new Request(new URL('/api/auth/sign-in/email', url.origin), {
				method: 'POST',
				headers,
				body: JSON.stringify(parsed.data)
			})
		);

		if (!response.ok) {
			const body = await errorBody(response);
			// Unverified is not a wrong password: it has its own screen, and "invalid
			// credentials" would send this person to reset a password that works.
			if (body.code === 'EMAIL_NOT_VERIFIED') {
				const params = new URLSearchParams({ email: parsed.data.email });
				if (url.searchParams.get('returnTo')) params.set('returnTo', returnTo);
				redirect(303, `/verify-email?${params}`);
			}
			if (response.status === 429) {
				return fail(429, { message: 'Too many attempts. Wait a moment and try again.' });
			}
			// 400 and 401 both mean "these credentials did not work" to the reader.
			return fail(response.status === 400 ? 401 : response.status, {
				message: body.message || 'Invalid credentials.'
			});
		}

		// The session cookie Better Auth just minted, carried onto this response.
		// Re-deriving its lifetime here would be a second opinion on how long
		// "remember me" lasts.
		applySetCookies(cookies, response.headers);

		redirect(303, returnTo);
	}
};
