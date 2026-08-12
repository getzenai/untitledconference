/**
 * Speaker sourcing pipeline board (CRM-07 / CRM-08).
 */
import {
	isPipelineStage,
	PIPELINE_STAGES,
	type PipelineStage
} from '$lib/conference/pipeline-stages';
import { organizerOrganizationIds } from '$lib/server/conference/contacts';
import {
	boardByStage,
	enrollableContacts,
	enrollContact,
	getPipelineCard,
	listPipelineCards,
	movePipelineCard,
	updatePipelineCardNotes
} from '$lib/server/conference/pipeline';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const orgIds = await organizerOrganizationIds(userId);
	const canManage = orgIds.length > 0;

	if (!canManage) {
		return {
			canManage: false,
			board: Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []])),
			stages: [...PIPELINE_STAGES],
			enrollable: [],
			selected: null as Awaited<ReturnType<typeof getPipelineCard>>
		};
	}

	const cards = await listPipelineCards(userId);
	const selectedId = Number(url.searchParams.get('card') ?? '');
	const selected =
		Number.isInteger(selectedId) && selectedId > 0
			? await getPipelineCard(userId, selectedId)
			: null;

	return {
		canManage: true,
		board: boardByStage(cards),
		stages: [...PIPELINE_STAGES],
		enrollable: await enrollableContacts(userId),
		selected
	};
};

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

function optionalInt(form: FormData, key: string): number | null {
	const raw = String(form.get(key) ?? '').trim();
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

export const actions: Actions = {
	enroll: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const form = await request.formData();
		const speakerProfileId = Number(form.get('speakerProfileId'));
		const stageRaw = text(form, 'stage').trim() || 'identified';
		const stage = isPipelineStage(stageRaw) ? (stageRaw as PipelineStage) : 'identified';
		const score = optionalInt(form, 'score');
		const rationale = text(form, 'rationale');

		const result = await enrollContact(userId, speakerProfileId, {
			stage,
			score,
			rationale
		});

		if (!result.ok) {
			if (result.reason === 'already_enrolled') {
				throw redirect(303, `/contacts/pipeline?card=${result.cardId}`);
			}
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			return fail(404, { error: 'Contact not found.' });
		}

		throw redirect(303, `/contacts/pipeline?card=${result.cardId}`);
	},

	move: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const form = await request.formData();
		const cardId = Number(form.get('cardId'));
		const toStage = text(form, 'toStage').trim();

		const result = await movePipelineCard(userId, cardId, toStage);
		if (!result.ok) {
			if (result.reason === 'invalid') return fail(400, { error: result.message });
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			return fail(404, { error: 'Card not found.' });
		}

		throw redirect(303, `/contacts/pipeline?card=${result.cardId}`);
	},

	note: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const form = await request.formData();
		const cardId = Number(form.get('cardId'));
		const notes = text(form, 'notes');

		const result = await updatePipelineCardNotes(userId, cardId, notes);
		if (!result.ok) {
			if (result.reason === 'forbidden') return fail(403, { error: 'Not allowed.' });
			return fail(404, { error: 'Card not found.' });
		}

		throw redirect(303, `/contacts/pipeline?card=${result.cardId}`);
	}
};
