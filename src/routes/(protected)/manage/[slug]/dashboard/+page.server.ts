import { requireOrganizer } from '$lib/server/conference/access';
import { conferenceDashboard } from '$lib/server/conference/dashboard';
import { dispatchConferenceEmails } from '$lib/server/conference/email-dispatcher';
import { queueReviewReminder } from '$lib/server/conference/review-management';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return { dashboard: await conferenceDashboard(conference.id) };
};

export const actions: Actions = {
	remindReviewer: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const reviewerUserId = form.get('reviewerUserId');
		if (typeof reviewerUserId !== 'string' || reviewerUserId === '') {
			return fail(400, { reminderMessage: 'Unknown reviewer.' });
		}
		const result = await queueReviewReminder(conference, reviewerUserId);
		if (result === 'no_email') return fail(400, { reminderMessage: 'Reviewer has no email.' });
		return {
			reminderMessage:
				result === 'queued'
					? 'Review reminder queued.'
					: result === 'already_queued'
						? 'That reviewer was already reminded.'
						: 'That reviewer has nothing outstanding.'
		};
	},
	dispatchMail: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await dispatchConferenceEmails(conference.id);
		if (result.disabled) {
			return fail(503, { mailMessage: 'Mail delivery is not configured.' });
		}
		return {
			mailMessage:
				`${result.sent} sent` +
				(result.failed > 0 ? ` · ${result.failed} failed` : '') +
				(result.remaining > 0 ? ` · ${result.remaining} still queued` : '')
		};
	}
};
