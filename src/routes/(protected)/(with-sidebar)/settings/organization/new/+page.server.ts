import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The create-an-organization form.
 *
 * Belonging to none is the *expected* state here — it is the whole reason
 * somebody lands on this page. The previous version opened with
 * `getActiveMember`, which errors in exactly that state, so the one page meant
 * to rescue a user without an organization was the one page that could not be
 * reached without one. `listOrganizations` answers the membership question
 * without objecting to the answer being empty.
 */
export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const organizations = await auth.api.listOrganizations({ headers: request.headers });
	const existing =
		organizations?.find((org) => org.id === locals.organizationId) ?? organizations?.[0];

	if (existing?.slug) {
		throw redirect(303, `/settings/organization/${existing.slug}`);
	}

	return {};
};
