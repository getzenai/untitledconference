import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	let redirectPath: string | null = null;

	try {
		const headers = request.headers;

		// Get active member info to check current organization
		const activeMember = await auth.api.getActiveMember({ headers });

		if (activeMember?.organizationId) {
			// User has an active organization, get its details
			const organizations = await auth.api.listOrganizations({ headers });
			const activeOrg = organizations?.find((org) => org.id === activeMember.organizationId);

			if (activeOrg?.slug) {
				// Set redirect to the organization details page
				redirectPath = `/settings/organization/${activeOrg.slug}`;
			}
		}

		// If no redirect path set, user doesn't have an organization
		if (!redirectPath) {
			redirectPath = '/settings/organization/new';
		}
	} catch (error) {
		// For API errors, redirect to new organization page
		console.error('Error checking organization status:', error);
		redirectPath = '/settings/organization/new';
	}

	// Perform redirect outside try-catch
	throw redirect(303, redirectPath);
};
