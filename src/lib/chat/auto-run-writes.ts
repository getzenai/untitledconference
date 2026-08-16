/**
 * Writes that run without a card (#726).
 *
 * The server uses this to build `toolApproval`. The panel uses it to refresh
 * the page after one of these lands — auto-run writes never enter
 * `approval-requested`, so the card-gated invalidate would miss them.
 *
 * A name that is not here needs a card, including a tool added later.
 */
export const ASSISTANT_AUTO_RUN_WRITES = [
	'add_cfp_field',
	'assign_reviews',
	'create_break',
	'create_conference',
	'create_review_round',
	'create_room',
	'create_session_format',
	'create_track',
	'fill_schedule',
	'invite_reviewer',
	'move_cfp_field',
	'move_talk',
	'place_talk',
	'remove_break',
	'remove_reviewer',
	'restore_conference',
	'set_cfp_fixed_question',
	'submit_proposal',
	'submit_review',
	'swap_talks',
	'unplace_talk',
	'update_cfp_field',
	'update_cfp_form',
	'update_conference',
	'update_my_speaker_profile',
	'update_proposal'
] as const;

const AUTO_RUN = new Set<string>(ASSISTANT_AUTO_RUN_WRITES);

/**
 * True when a finished tool changed page data. Gated writes are known from
 * the card; auto-run writes are known from the set. A read is neither.
 */
export function assistantWriteRefreshesPage(toolName: string, sawApprovalCard: boolean): boolean {
	return sawApprovalCard || AUTO_RUN.has(toolName);
}
