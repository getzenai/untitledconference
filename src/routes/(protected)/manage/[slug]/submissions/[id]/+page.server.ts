import { normalizeRecordingUrl } from '$lib/conference/recording-url';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	decisionNotificationStatuses,
	notifySubmissionDecisions
} from '$lib/server/conference/decision-notifications';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import { submissionDetail } from '$lib/server/conference/organizer-submissions';
import { setRecordingUrl } from '$lib/server/conference/recordings';
import {
	reviewAssignmentMatrix,
	setReviewAssignment,
	type AssignmentResult
} from '$lib/server/conference/review-management';
import { ownReviewAccess } from '$lib/server/conference/reviewer';
import { editSubmissionContent, lastContentEdit } from '$lib/server/conference/submission-content';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DECISIONS: Decision[] = ['accepted', 'rejected', 'waitlisted'];

function submissionId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Submission not found');
	return id;
}

function assignmentMessage(result: AssignmentResult): string {
	if (result === 'assigned') return 'Reviewer assigned.';
	if (result === 'unassigned') return 'Reviewer unassigned.';
	if (result === 'complete') return 'A submitted review is kept as part of the review record.';
	return 'The assignment was already up to date.';
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const submission = await submissionDetail(conference.id, submissionId(params.id));
	if (!submission) throw error(404, 'Submission not found');
	const [notificationStatuses, assignmentRounds, ownReview, contentEdit] = await Promise.all([
		decisionNotificationStatuses(conference.id, [submission]),
		reviewAssignmentMatrix(conference.id, submission.id),
		// An organizer who also holds a reviewer seat writes their review on the
		// reviewer surface, not here — this only says whether that door is open for
		// them, and it asks the same two questions that surface would.
		ownReviewAccess(conference.id, locals.user!.id, submission.id),
		lastContentEdit(submission.id)
	]);

	return {
		submission,
		notificationStatus: notificationStatuses[submission.id] ?? null,
		assignmentRounds,
		ownReview,
		contentEdit
	};
};

export const actions: Actions = {
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const decision = form.get('decision');
		if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
			return fail(400, { message: 'Unknown decision.' });
		}

		const result = await decideSubmissions(
			conference,
			[submissionId(params.id)],
			decision as Decision
		);
		return { decision, result };
	},

	notify: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		return {
			notificationResult: await notifySubmissionDecisions(conference, [submissionId(params.id)])
		};
	},

	assignment: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const roundId = Number(form.get('roundId'));
		const reviewerUserId = form.get('reviewerUserId');
		const intent = form.get('intent');
		if (
			!Number.isInteger(roundId) ||
			roundId <= 0 ||
			typeof reviewerUserId !== 'string' ||
			reviewerUserId === '' ||
			(intent !== 'assign' && intent !== 'unassign')
		) {
			return fail(400, { assignmentMessage: 'Unknown reviewer assignment.' });
		}

		const result = await setReviewAssignment(
			conference.id,
			submissionId(params.id),
			roundId,
			reviewerUserId,
			intent === 'assign'
		);
		if (result === 'invalid') {
			return fail(400, { assignmentMessage: 'That reviewer cannot review this submission.' });
		}
		return { assignmentMessage: assignmentMessage(result) };
	},

	/**
	 * The organizer fixes the talk's own text.
	 *
	 * `contentErrors` rather than the `message` the other actions use: this form has
	 * per-field errors and sits halfway down the page, so its answer belongs beside it
	 * and not in the banner at the top.
	 */
	content: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === 'string' ? value : null;
		};

		const submitted = {
			title: field('title') ?? '',
			abstract: field('abstract'),
			keyTakeaway: field('keyTakeaway'),
			audienceLevel: field('audienceLevel')
		};

		const result = await editSubmissionContent(
			conference.id,
			submissionId(params.id),
			locals.user!.id,
			submitted
		);

		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			// The rejected text comes back with the errors. Without it the re-render reads
			// the fields from the database again, and the organizer's rewrite — the thing
			// they came to do — is gone at the moment they are told to fix it.
			return fail(400, { contentErrors: result.errors, contentValues: submitted });
		}

		return { contentSaved: result.changed ? 'Talk updated.' : 'Nothing to change.' };
	},

	/**
	 * #20 stage 1: after the event, the organizer pastes the video link.
	 *
	 * The placement id comes out of the form, so it is checked rather than trusted —
	 * `setRecordingUrl` matches on the conference too, and "no row" answers 404 instead
	 * of reporting a save that did not happen.
	 */
	recording: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const placementId = Number(form.get('placementId'));
		if (!Number.isInteger(placementId) || placementId <= 0) {
			return fail(400, { message: 'Unknown session.' });
		}

		const parsed = normalizeRecordingUrl(String(form.get('recordingUrl') ?? ''));
		if (!parsed.ok) return fail(400, { message: parsed.message });

		const saved = await setRecordingUrl(conference.id, placementId, parsed.url);
		if (!saved) throw error(404, 'Session not found');

		return { recording: parsed.url };
	}
};
