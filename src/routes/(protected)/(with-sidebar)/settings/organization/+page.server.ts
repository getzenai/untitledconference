import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	try {
		const headers = request.headers;

		// Get active member info to check current organization
		const activeMember = await auth.api.getActiveMember({ headers });

		if (activeMember?.organizationId) {
			// User has an active organization, get its details
			const organizations = await auth.api.listOrganizations({ headers });
			const activeOrg = organizations?.find((org) => org.id === activeMember.organizationId);

			if (activeOrg?.slug) {
				// Redirect to the organization details page
				throw redirect(303, `/settings/organization/${activeOrg.slug}`);
			}
		}

		// User doesn't have an organization, redirect to create new
		throw redirect(303, '/settings/organization/new');
	} catch (error) {
		// If an error is a redirect, re-throw it
		if (error instanceof Error && 'status' in error && 'location' in error) {
			throw error;
		}

		// For other errors, redirect to new organization page
		console.error('Error checking organization status:', error);
		throw redirect(303, '/settings/organization/new');
	}
};
