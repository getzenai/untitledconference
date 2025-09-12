import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// Check if user already has an active organization
	const headers = request.headers;
	const activeMember = await auth.api.getActiveMember({ headers });

	if (activeMember?.organizationId) {
		// User already has an organization, redirect to it
		const organizations = await auth.api.listOrganizations({ headers });
		const activeOrg = organizations?.find((org) => org.id === activeMember.organizationId);

		if (activeOrg?.slug) {
			throw redirect(303, `/settings/organization/${activeOrg.slug}`);
		}
	}

	// User doesn't have an organization, can proceed with creation
	return {};
};
