/**
 * What the organizer is still waiting for, per speaker (CNT-06..09, SPK-10).
 */
import {
	openAcceptConditions,
	resolveAcceptCondition
} from '$lib/server/conference/accept-condition';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	queueDeliverableReminders,
	type DeliverableReminderTally
} from '$lib/server/conference/deliverable-reminders';
import {
	advanceEditorialStand,
	hangingEditorialStands
} from '$lib/server/conference/editorial-stand';
import { contentOverview, contentTotals } from '$lib/server/conference/organizer-content';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const [speakers, totals, conditions, hanging] = await Promise.all([
		contentOverview(conference.id),
		contentTotals(conference.id),
		openAcceptConditions(conference.id),
		hangingEditorialStands(conference.id)
	]);

	return { conference, speakers, totals, conditions, hanging };
};

/**
 * The tally as one line (CNT-08), same shape as the reviewer reminder's.
 *
 * Every category is named, not just the successes: "8 reminders queued" after ticking
 * twelve speakers reads like something went wrong, while "8 queued · 3 already
 * reminded · 1 without an email address" accounts for all twelve.
 */
function summarizeReminders(tally: DeliverableReminderTally): string {
	const parts: string[] = [];
	if (tally.queued > 0) {
		parts.push(`${tally.queued} reminder${tally.queued === 1 ? '' : 's'} queued`);
	}
	if (tally.already_queued > 0) parts.push(`${tally.already_queued} already reminded`);
	if (tally.nothing_outstanding > 0) {
		parts.push(`${tally.nothing_outstanding} with nothing open`);
	}
	if (tally.no_email > 0) parts.push(`${tally.no_email} without an email address`);
	return parts.join(' · ');
}

export const actions: Actions = {
	remindSpeakers: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		// A non-numeric id is dropped rather than coerced: `Number('')` is 0, and a 0
		// would go on to select no speaker while still being counted as a recipient.
		const speakerProfileIds = form
			.getAll('speakerProfileIds')
			.map((value) => Number(value))
			.filter((id) => Number.isInteger(id) && id > 0);

		if (speakerProfileIds.length === 0) {
			return fail(400, { reminderMessage: 'Select at least one speaker first.' });
		}

		return {
			reminderMessage: summarizeReminders(
				await queueDeliverableReminders(conference, speakerProfileIds)
			)
		};
	},

	resolveCondition: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { conditionMessage: 'Unknown submission.' });
		}

		const result = await resolveAcceptCondition(conference.id, id);
		if (!result.ok) throw error(404, 'Submission not found');
		return { conditionMessage: result.changed ? 'Condition resolved.' : 'Nothing to resolve.' };
	},

	advanceStand: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { standMessage: 'Unknown submission.' });
		}

		const result = await advanceEditorialStand(conference.id, id);
		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			if (result.reason === 'already_final') {
				return { standMessage: 'This talk is already final.' };
			}
			return fail(400, { standMessage: 'Only an accepted talk can carry a stand.' });
		}
		return { standMessage: 'Stand advanced.' };
	}
};
