import { getPublicInvitation } from '$lib/server/public-invitation';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { code } = params;

	if (!code) {
		throw error(404, 'Invalid invitation link');
	}

	try {
		const invitation = await getPublicInvitation(code);
		if (!invitation.isValid) return { invitationCode: code, ...invitation };

		return {
			invitationCode: code,
			...invitation
		};
	} catch (err) {
		console.error('Error checking invitation:', err);
		return {
			invitationCode: code,
			isValid: false,
			error: 'Failed to validate invitation'
		};
	}
};
