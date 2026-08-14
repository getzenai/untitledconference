import { requireOrganizer } from '$lib/server/conference/access';
import { hasSpeakerProfile } from '$lib/server/conference/nav-access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	// The one permission boundary in the product, asked once for the whole area.
	//
	// The speaker-profile flag rides along in the same `Promise.all`: it is the one
	// item the account menu shows conditionally (#127), and asking for it beside the
	// permission costs a pipelined query on the connection this request already has,
	// not a second round trip.
	const [{ conference }, speakerProfile] = await Promise.all([
		requireOrganizer(locals.user!.id, params.slug),
		hasSpeakerProfile(locals.user!.id, locals.user!.email ?? null)
	]);

	return { conference, speakerProfile };
};
