import { db } from '$lib/server/db';
import { oauthClient } from '$lib/server/db/auth-schema';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

// The oauth-provider plugin redirects here with the signed authorization query
// (client_id, scope, state, sig, ...). The page only displays client name and
// requested scopes; the actual consent decision is validated server-side by
// POST /api/auth/oauth2/consent against the signed query.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		// Consent requires a session. Preserve the signed OAuth query so the login
		// page can continue the authorization flow after sign-in.
		throw redirect(303, `/login?${url.searchParams.toString()}`);
	}

	const clientId = url.searchParams.get('client_id');
	const scopes = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);

	// Client names are self-asserted at registration, so the redirect destination
	// is shown alongside the name as provenance.
	let clientFound = false;
	let clientName: string | null = null;
	let redirectHost: string | null = null;

	if (clientId) {
		const [client] = await db
			.select({ name: oauthClient.name, redirectUris: oauthClient.redirectUris })
			.from(oauthClient)
			.where(eq(oauthClient.clientId, clientId))
			.limit(1);
		clientFound = Boolean(client);
		clientName = client?.name ?? null;
		try {
			redirectHost = client?.redirectUris?.[0] ? new URL(client.redirectUris[0]).host : null;
		} catch {
			redirectHost = null;
		}
	}

	return {
		valid: clientFound,
		clientId,
		clientName,
		redirectHost,
		scopes,
		email: locals.user.email
	};
};
