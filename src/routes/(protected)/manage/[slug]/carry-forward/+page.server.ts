import { type CarryForwardDisposition } from '$lib/conference/carry-forward';
import { requireOrganizer } from '$lib/server/conference/access';
import { carryForwardLane, setCarryForwardDisposition } from '$lib/server/conference/carry-forward';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const lane = await carryForwardLane(conference.id);
	return { lane };
};

function writeError(reason: 'no_predecessor' | 'not_found'): string {
	if (reason === 'no_predecessor') {
		return 'Name the previous edition on the events list first.';
	}
	return 'That talk is not a declined submission from the previous edition.';
}

async function writeDisposition(
	userId: string,
	slug: string,
	form: FormData,
	disposition: CarryForwardDisposition
) {
	const { conference } = await requireOrganizer(userId, slug);
	const submissionId = Number(form.get('submissionId'));
	if (!Number.isInteger(submissionId) || submissionId <= 0) {
		return fail(400, { message: writeError('not_found') });
	}

	const result = await setCarryForwardDisposition(conference.id, submissionId, disposition);
	if (!result.ok) return fail(400, { message: writeError(result.reason) });
	return { disposition: result.disposition, submissionId };
}

export const actions: Actions = {
	invite: async ({ locals, params, request }) => {
		return writeDisposition(locals.user!.id, params.slug, await request.formData(), 'invited');
	},

	discard: async ({ locals, params, request }) => {
		return writeDisposition(locals.user!.id, params.slug, await request.formData(), 'discarded');
	}
};
