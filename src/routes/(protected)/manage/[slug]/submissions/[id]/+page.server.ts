import { DRAFT_DECISION_REASON } from '$lib/conference/decision-summary';
import { parseEditorialStand } from '$lib/conference/editorial-stand';
import { normalizeRecordingUrl } from '$lib/conference/recording-url';
import { SUBMITTED_REVIEW_UNASSIGN_REASON } from '$lib/conference/review-assignment';
import {
	conditionForDecision,
	conferenceOrganizers,
	parseAcceptCondition,
	resolveAcceptCondition,
	updateAcceptCondition
} from '$lib/server/conference/accept-condition';
import { sentenceForDecision } from '$lib/server/conference/decision-note';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	decisionNotificationStatuses,
	notifySubmissionDecisions
} from '$lib/server/conference/decision-notifications';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import { advanceEditorialStand, setEditorialStand } from '$lib/server/conference/editorial-stand';
import { submissionDetail } from '$lib/server/conference/organizer-submissions';
import { setRecordingUrl } from '$lib/server/conference/recordings';
import {
	reviewAssignmentMatrix,
	setReviewAssignment,
	type AssignmentResult
} from '$lib/server/conference/review-management';
import { ownReviewAccess } from '$lib/server/conference/reviewer';
import { speakerHistoryForSubmission } from '$lib/server/conference/speaker-history';
import { setSubmissionSponsorTier, sponsorTiers } from '$lib/server/conference/sponsor-tiers';
import { editSubmissionContent, lastContentEdit } from '$lib/server/conference/submission-content';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DECISIONS: Decision[] = ['accepted', 'rejected', 'waitlisted', 'resubmit_with_guidance'];

function submissionId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Submission not found');
	return id;
}

function assignmentMessage(result: AssignmentResult): string {
	if (result === 'assigned') return 'Reviewer assigned.';
	if (result === 'unassigned') return 'Reviewer unassigned.';
	return 'The assignment was already up to date.';
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const submission = await submissionDetail(conference.id, submissionId(params.id));
	if (!submission) throw error(404, 'Submission not found');
	const [
		notificationStatuses,
		assignmentRounds,
		ownReview,
		contentEdit,
		tiers,
		organizers,
		speakerHistory
	] = await Promise.all([
		decisionNotificationStatuses(conference.id, [submission]),
		reviewAssignmentMatrix(conference.id, submission.id),
		// An organizer who also holds a reviewer seat writes their review on the
		// reviewer surface, not here — this only says whether that door is open for
		// them, and it asks the same two questions that surface would.
		ownReviewAccess(conference.id, locals.user!.id, submission.id),
		lastContentEdit(submission.id),
		sponsorTiers(conference.id),
		conferenceOrganizers(conference),
		// #451: no anonymised gate here — this is the organizer's own screen, and
		// they already have the speakers' names two panels up.
		speakerHistoryForSubmission(conference, submission.id)
	]);

	return {
		submission,
		notificationStatus: notificationStatuses[submission.id] ?? null,
		assignmentRounds,
		ownReview,
		contentEdit,
		sponsorTiers: tiers,
		organizers,
		speakerHistory
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

		const note = await conditionForDecision(conference, form, decision);
		if (!note.ok) return fail(400, { message: note.message });

		const sentence = sentenceForDecision(form, decision);
		if (!sentence.ok) return fail(400, { message: sentence.message });

		const result = await decideSubmissions(
			conference,
			[submissionId(params.id)],
			decision as Decision,
			note.condition,
			sentence.sentence
		);
		// A disabled button is not a lock (#471). The bulk path still reports
		// skipped drafts as a success summary; on this one talk that line used
		// to look like confirmation. Refuse instead.
		if (result.skippedDrafts > 0 && result.decided === 0 && result.unchanged === 0) {
			return fail(400, { message: DRAFT_DECISION_REASON });
		}
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
		if (result === 'complete') {
			return fail(400, { assignmentMessage: SUBMITTED_REVIEW_UNASSIGN_REASON });
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
	},

	/**
	 * Internal marker. The select is the whole of the write — there is no second
	 * page, and the list badge is a read of the same column.
	 *
	 * Empty / `none` clears. A tier id from another conference is refused rather
	 * than stored: the id arrives from a form, so the conference check lives here
	 * the same way `setRecordingUrl` checks the placement.
	 */
	sponsor: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const raw = String((await request.formData()).get('sponsorTierId') ?? '');
		const tierId = raw === '' || raw === 'none' ? null : Number(raw);
		if (tierId !== null && (!Number.isInteger(tierId) || tierId <= 0)) {
			return fail(400, { sponsorError: 'Unknown sponsor tier.' });
		}

		const result = await setSubmissionSponsorTier(conference.id, submissionId(params.id), tierId);
		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			return fail(400, { sponsorError: 'That sponsor tier is not on this conference.' });
		}

		return {
			sponsorMessage: tierId === null ? 'Sponsor marker cleared.' : 'Sponsor tier saved.'
		};
	},

	/**
	 * The follow-up landed. The talk stays accepted; only the note goes.
	 */
	resolveCondition: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await resolveAcceptCondition(conference.id, submissionId(params.id));
		if (!result.ok) throw error(404, 'Submission not found');
		return { conditionMessage: result.changed ? 'Condition resolved.' : 'Nothing to resolve.' };
	},

	/**
	 * Names where an accepted talk sits in the editorial loop. The talk stays
	 * accepted; only the stand moves (#446).
	 */
	setEditorialStand: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const parsed = parseEditorialStand(await request.formData());
		if (!parsed.ok) return fail(400, { standMessage: parsed.message });

		const result = await setEditorialStand(conference.id, submissionId(params.id), parsed.stand);
		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			return fail(400, { standMessage: 'Only an accepted talk can carry a stand.' });
		}
		return { standMessage: 'Stand saved.' };
	},

	advanceEditorialStand: async ({ locals, params }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const result = await advanceEditorialStand(conference.id, submissionId(params.id));
		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			if (result.reason === 'already_final') {
				return { standMessage: 'This talk is already final.' };
			}
			return fail(400, { standMessage: 'Only an accepted talk can carry a stand.' });
		}
		return { standMessage: 'Stand advanced.' };
	},

	/**
	 * The sentence was wrong, or the owner was. The talk stays accepted;
	 * only the note is rewritten (#540).
	 */
	updateCondition: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const parsed = parseAcceptCondition(await request.formData());
		if (!parsed.ok) return fail(400, { conditionMessage: parsed.message });
		if (!parsed.condition) {
			return fail(400, { conditionMessage: 'Say what the accept depends on.' });
		}

		const result = await updateAcceptCondition(
			conference,
			submissionId(params.id),
			parsed.condition
		);
		if (!result.ok) {
			if (result.reason === 'not_found') throw error(404, 'Submission not found');
			if (result.reason === 'invalid_owner') {
				return fail(400, { conditionMessage: 'That person cannot follow this up.' });
			}
			if (result.reason === 'not_accepted') {
				return fail(400, { conditionMessage: 'Only an accepted talk can carry a condition.' });
			}
			return fail(400, { conditionMessage: 'There is no condition to rewrite.' });
		}
		return { conditionMessage: 'Condition saved.' };
	}
};
