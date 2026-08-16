/**
 * The speaker's question on a portal task file, as a parked field (#789).
 *
 * One key per file: two deliverables on the same task must not share a draft,
 * and two tasks must not share one either. The prefix is `portal-`, not
 * `speaker-` (roster) or `contact-` (CRM).
 *
 * The file picker is a byte upload and is not parked.
 */
import { browserDraftLeavePrompt } from './browser-draft-copy';

export function portalTaskCommentScope(taskId: number, deliverableId: number): string {
	return `portal-task-comment:${taskId}:${deliverableId}`;
}

/**
 * Leave prompt for the comment box. Names what `dirty` tracks.
 * Does not say the page is saved, and does not cover the file picker.
 */
export const PORTAL_TASK_COMMENT_LEAVE_PROMPT = browserDraftLeavePrompt(
	'what you typed to the programme team'
);
