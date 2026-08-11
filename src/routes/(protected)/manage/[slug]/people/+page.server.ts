/**
 * Team & reviewers — committee visibility (#63) and who is on the committee.
 *
 * The roster half is what makes the visibility half mean anything: a reviewer
 * exists only as a `membership` row, and until this page could write one, no
 * conference outside the demo seed had anybody to assign.
 */
import { auth } from '$lib/auth';
import type { ReviewVisibility } from '$lib/conference/review-visibility';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addReviewer,
	committee,
	pendingReviewerInvitations,
	removeReviewer,
	reviewerTracks,
	setReviewerTracks
} from '$lib/server/conference/reviewer-roster';
import { db } from '$lib/server/db';
import { invitation } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { createLogger } from '$lib/server/logger';
import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const MODES: ReviewVisibility[] = ['open', 'blind_until_reviewed'];
const logger = createLogger('ReviewerManagement');

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const [members, tracks, pendingInvitations] = await Promise.all([
		committee(conference.id),
		reviewerTracks(conference.id),
		pendingReviewerInvitations(conference.id)
	]);
	return { committee: members, tracks, pendingInvitations };
};

export const actions: Actions = {
	addReviewer: async ({ locals, params, request, url }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const email = String((await request.formData()).get('email') ?? '');

		const result = await addReviewer(conference.id, email);
		if (result.ok) return { message: `${result.name} can now be assigned submissions to review.` };
		if (result.reason !== 'no_account') return fail(400, { message: result.message });

		try {
			const created = await auth.api.createInvitation({
				headers: request.headers,
				body: {
					organizationId: conference.organizationId,
					email: email.trim(),
					role: 'member'
				}
			});
			await db
				.update(invitation)
				.set({ conferenceId: conference.id })
				.where(
					and(
						eq(invitation.id, created.id),
						eq(invitation.organizationId, conference.organizationId)
					)
				);

			return {
				message: `Invitation created for ${email.trim()}. They join this review committee when they accept it.`,
				invitationLink: new URL(`/invite/${created.id}`, url).toString()
			};
		} catch (error) {
			logger.error('Failed to create reviewer invitation', error, {
				conferenceId: conference.id,
				organizationId: conference.organizationId,
				email: email.trim()
			});
			return fail(403, {
				message:
					'That account does not exist yet, and your organization role cannot invite new members.'
			});
		}
	},

	updateTracks: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const membershipId = Number(form.get('membershipId'));
		const mode = form.get('trackMode');
		const trackIds = form
			.getAll('trackId')
			.map(Number)
			.filter((id) => Number.isInteger(id) && id > 0);

		if (!Number.isInteger(membershipId) || (mode !== 'all' && mode !== 'selected')) {
			return fail(400, { message: 'Unknown track restriction.' });
		}
		const result = await setReviewerTracks(conference.id, membershipId, mode, trackIds);
		if (!result.ok) return fail(400, { message: result.message });
		return {
			message:
				mode === 'all'
					? 'Reviewer can now be assigned submissions from every track.'
					: 'Reviewer track restrictions updated.'
		};
	},

	removeReviewer: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('membershipId'));

		if (!Number.isInteger(id)) return fail(400, { message: 'Unknown committee member.' });

		const result = await removeReviewer(conference.id, id);
		if (!result.ok) return fail(400, { message: 'Unknown committee member.' });

		return { message: 'Removed from the committee. Reviews they already filed are kept.' };
	},

	reviewVisibility: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const mode = String((await request.formData()).get('mode')) as ReviewVisibility;

		if (!MODES.includes(mode)) return fail(400, { message: 'Unknown review mode.' });

		await db
			.update(conferenceTable)
			.set({ reviewVisibility: mode })
			.where(eq(conferenceTable.id, conference.id));

		return {
			message:
				mode === 'open'
					? 'Reviewers now see each other’s scores and comments at any time.'
					: 'Reviewers now see each other’s scores and comments only after filing their own.'
		};
	}
};
