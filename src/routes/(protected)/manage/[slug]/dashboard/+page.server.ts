import { requireOrganizer } from '$lib/server/conference/access';
import { conferenceDashboard } from '$lib/server/conference/dashboard';
import { dispatchConferenceEmails } from '$lib/server/conference/email-dispatcher';
import {
	queueReviewReminders,
	type BulkReminderTally
} from '$lib/server/conference/review-management';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return { dashboard: await conferenceDashboard(conference.id) };
};

/**
 * The tally as one line an organizer can act on (ABS-09).
 *
 * Every category is named, not just the successes: "8 reminders queued" after
 * selecting twelve people reads like something went wrong, while "8 queued · 3
 * already reminded · 1 has nothing outstanding" accounts for all twelve and stops
 * the second click. Zeroes are left out — a reason that did not happen is noise.
 */
function summarizeReminders(tally: BulkReminderTally): string {
	const parts: string[] = [];
	if (tally.queued > 0) {
		parts.push(`${tally.queued} reminder${tally.queued === 1 ? '' : 's'} queued`);
	}
	if (tally.already_queued > 0) parts.push(`${tally.already_queued} already reminded`);
	if (tally.nothing_outstanding > 0) {
		parts.push(`${tally.nothing_outstanding} with nothing outstanding`);
	}
	if (tally.no_email > 0) parts.push(`${tally.no_email} without an email address`);
	return parts.join(' · ');
}

export const actions: Actions = {
	remindReviewer: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const reviewerUserId = form.get('reviewerUserId');
		if (typeof reviewerUserId !== 'string' || reviewerUserId === '') {
			return fail(400, { reminderMessage: 'Unknown reviewer.' });
		}
		const tally = await queueReviewReminders(conference, [reviewerUserId]);
		if (tally.no_email === 1) return fail(400, { reminderMessage: 'Reviewer has no email.' });
		return {
			reminderMessage:
				tally.queued === 1
					? 'Review reminder queued.'
					: tally.already_queued === 1
						? 'That reviewer was already reminded.'
						: 'That reviewer has nothing outstanding.'
		};
	},

	/**
	 * The same reminder for a chosen set of reviewers.
	 *
	 * Deliberately a separate action from the single-row one rather than a shared
	 * one with a list of length one: the two produce different sentences, and the
	 * single-row message ("already reminded") is the more useful of the two when
	 * exactly one person is meant.
	 */
	remindReviewers: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const reviewerUserIds = form
			.getAll('reviewerIds')
			.filter((value): value is string => typeof value === 'string' && value !== '');
		if (reviewerUserIds.length === 0) {
			return fail(400, { reminderMessage: 'Select at least one reviewer first.' });
		}
		return {
			reminderMessage: summarizeReminders(await queueReviewReminders(conference, reviewerUserIds))
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
