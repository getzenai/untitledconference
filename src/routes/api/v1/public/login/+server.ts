import { auth } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

async function performSignIn(email: string, password: string, headers: Headers) {
	try {
		const result = await auth.api.signInEmail({
			body: { email, password },
			headers
		});
		return result;
	} catch (authError) {
		const errorMessage = authError instanceof Error ? authError.message : String(authError);
		console.log('[Login API] Auth error (likely invalid credentials):', errorMessage);

		// Check if it's a credentials error vs server error
		const isCredentialsError =
			errorMessage?.includes('Invalid credentials') ||
			errorMessage?.includes('User not found') ||
			errorMessage?.includes('Invalid password');

		if (isCredentialsError) {
			throw new Error('INVALID_CREDENTIALS');
		}

		// For other auth errors, return 401 as well (instead of 500)
		throw new Error('AUTH_FAILED');
	}
}

function extractAuthHeaders(result: unknown): Headers {
	const resultWithHeaders = result as Record<string, unknown>;
	const responseHeaders = new Headers();

	if (resultWithHeaders.headers && typeof resultWithHeaders.headers === 'object') {
		const authHeaders = resultWithHeaders.headers as Headers;
		console.log('[Login API] Headers from Better Auth:', Object.fromEntries(authHeaders.entries()));

		// Forward Set-Cookie and other important headers from Better Auth
		authHeaders.forEach((value, key) => {
			const isImportantHeader =
				key.toLowerCase().startsWith('set-cookie') || key.toLowerCase() === 'authorization';
			if (isImportantHeader) {
				responseHeaders.set(key, value);
			}
		});
	}

	return responseHeaders;
}

function createSuccessResponse(
	user: { id: string; email: string },
	token: string | undefined,
	headers: Headers
) {
	return json(
		{
			success: true,
			user: {
				id: user.id,
				email: user.email
			},
			// Include token for integration testing purposes
			// In production, Better Auth handles sessions via cookies
			token
		},
		{ headers }
	);
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, password } = await request.json();

		console.log('[Login API] Request received for email:', email);

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Use Better Auth to sign in the user
		console.log('[Login API] Calling auth.api.signInEmail...');
		let result;
		try {
			result = await performSignIn(email, password, request.headers);
		} catch (authError) {
			const errorMessage = authError instanceof Error ? authError.message : String(authError);
			if (errorMessage === 'INVALID_CREDENTIALS') {
				return json({ error: 'Invalid credentials' }, { status: 401 });
			}
			return json({ error: 'Authentication failed' }, { status: 401 });
		}

		console.log('[Login API] Auth result:', {
			hasUser: !!result.user,
			hasToken: !!result.token,
			userId: result.user?.id,
			hasHeaders: !!(result as Record<string, unknown>).headers
		});

		const responseHeaders = extractAuthHeaders(result);

		// Better Auth returns user on success
		if (result.user) {
			return createSuccessResponse(result.user, result.token, responseHeaders);
		}

		console.log('[Login API] No user returned from auth.api.signInEmail');
		return json({ error: 'Invalid credentials' }, { status: 401 });
	} catch (error) {
		if (error instanceof Error) {
			console.error('[Login API] Error details:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
		}

		// Check if it's a JSON parsing error (client error)
		if (error instanceof SyntaxError && error.message.includes('JSON')) {
			return json({ error: 'Invalid JSON in request' }, { status: 400 });
		}

		// For other unexpected errors, return 500
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
