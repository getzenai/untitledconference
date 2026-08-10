import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Sends the user to their organization, or to the page that creates one.
 *
 * Asks `listOrganizations` rather than `getActiveMember`. The latter answers
 * with an error when the session carries no active organization, which is the
 * ordinary state of a new account — and the old code caught that error and
 * redirected to `/new`, where the same call ran unguarded and produced a 500
 * two redirects away from its cause. Membership is the question being asked
 * here, so ask it directly.
 */
export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const organizations = await auth.api.listOrganizations({ headers: request.headers });

	// The active one when the session names it, otherwise the first they belong
	// to. `locals.organizationId` comes from hooks.server.ts, which also adopts
	// one for sessions that have none.
	const active = organizations?.find((org) => org.id === locals.organizationId);
	const destination = active ?? organizations?.[0];

	throw redirect(
		303,
		destination?.slug ? `/settings/organization/${destination.slug}` : '/settings/organization/new'
	);
};
