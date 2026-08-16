/**
 * Empty-panel openers and the one-line description (#719, #730).
 *
 * The assistant holds the whole registry. The page is only "here", not a
 * fence. A chip that names a thing with no tool is a promise that goes
 * nowhere, so every suggestion carries the tool it is for. Click fills the
 * input; it does not send.
 *
 * The description names the *kind* of work, in the role's words. It must
 * not claim a page-scope that does not exist, and it must not describe
 * the approval card (#726): most writes no longer wait for a yes.
 */

export type AssistantSuggestion = {
	text: string;
	tool: string;
};

export type AssistantRole = 'organizer' | 'reviewer' | 'speaker' | 'anyone';

const FALLBACK: readonly AssistantSuggestion[] = [
	{ text: 'List my conferences', tool: 'list_my_conferences' },
	{ text: "What's in my review queue?", tool: 'list_my_review_assignments' },
	{ text: 'What have I submitted?', tool: 'list_my_proposals' }
];

const BY_ROUTE: { match: (routeId: string) => boolean; chips: readonly AssistantSuggestion[] }[] = [
	{
		match: (routeId) => routeId.includes('/manage/[slug]/agenda'),
		chips: [
			{ text: "What's still unscheduled?", tool: 'get_agenda_tray' },
			{ text: 'Fill the empty slots', tool: 'fill_schedule' },
			{ text: 'Move a talk', tool: 'move_talk' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/settings'),
		chips: [
			{ text: 'Add a room', tool: 'create_room' },
			{ text: 'Add a track', tool: 'create_track' },
			{ text: 'Add a session format', tool: 'create_session_format' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/cfp'),
		chips: [
			{ text: "What's on this call?", tool: 'get_cfp_form' },
			{ text: 'Add a question', tool: 'add_cfp_field' },
			{ text: 'Open the call', tool: 'open_cfp' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/decisions'),
		chips: [
			{ text: 'Accept or reject proposals', tool: 'decide_submissions' },
			{ text: 'Tell speakers the decision', tool: 'notify_speakers' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/people'),
		chips: [
			{ text: 'Who is on the committee?', tool: 'list_reviewers' },
			{ text: 'Invite a reviewer', tool: 'invite_reviewer' },
			{ text: 'Assign reviews', tool: 'assign_reviews' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/rounds'),
		chips: [
			{ text: 'List the review rounds', tool: 'list_review_rounds' },
			{ text: 'Start a review round', tool: 'create_review_round' },
			{ text: 'Assign reviews', tool: 'assign_reviews' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/submissions'),
		chips: [
			{ text: 'List the proposals', tool: 'list_submissions' },
			{ text: 'Look at a proposal', tool: 'get_submission' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/[slug]/dashboard'),
		chips: [
			{ text: "What's on this conference?", tool: 'get_conference' },
			{ text: 'List the proposals', tool: 'list_submissions' },
			{ text: "What's the schedule?", tool: 'get_agenda' }
		]
	},
	{
		match: (routeId) => routeId.includes('/manage/new') || routeId.endsWith('/manage'),
		chips: [
			{ text: 'Start a conference', tool: 'create_conference' },
			{ text: 'List my conferences', tool: 'list_my_conferences' }
		]
	},
	{
		match: (routeId) => /\/review\/\[slug\]\/\[submissionId\]/.test(routeId),
		chips: [
			{ text: 'Open this assignment', tool: 'get_review_assignment' },
			{ text: 'Write this review', tool: 'submit_review' },
			{ text: "What's in my review queue?", tool: 'list_my_review_assignments' }
		]
	},
	{
		match: (routeId) => routeId.includes('/review'),
		chips: [
			{ text: "What's in my review queue?", tool: 'list_my_review_assignments' },
			{ text: 'Open an assignment', tool: 'get_review_assignment' }
		]
	},
	{
		match: (routeId) => routeId.includes('/portal'),
		chips: [
			{ text: 'What have I submitted?', tool: 'list_my_proposals' },
			{ text: 'Update my speaker profile', tool: 'update_my_speaker_profile' }
		]
	}
];

export function assistantRole(routeId: string | null | undefined): AssistantRole {
	if (!routeId) return 'anyone';
	if (routeId.includes('/review')) return 'reviewer';
	if (routeId.includes('/portal')) return 'speaker';
	if (routeId.includes('/manage')) return 'organizer';
	return 'anyone';
}

export function assistantDescription(routeId: string | null | undefined): string {
	switch (assistantRole(routeId)) {
		case 'reviewer':
			return 'It can open your assigned talks and write the review.';
		case 'speaker':
			return 'It can look at your proposals and update your profile.';
		case 'organizer':
			return 'It can schedule talks, decide submissions, and send mail.';
		default:
			return 'It can look up conferences, reviews, and submissions.';
	}
}

export function assistantSuggestions(
	context:
		| {
				routeId?: string | null;
		  }
		| null
		| undefined
): AssistantSuggestion[] {
	const routeId = context?.routeId?.trim() ?? '';
	if (routeId) {
		for (const entry of BY_ROUTE) {
			if (entry.match(routeId)) return [...entry.chips];
		}
	}
	return [...FALLBACK];
}
