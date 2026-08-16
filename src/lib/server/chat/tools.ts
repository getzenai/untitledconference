/**
 * The tools the assistant is allowed to call: all of them.
 *
 * The definitions live in the MCP registry (`allTools`). The chat gets no tool
 * layer of its own — that is the whole point of #302. `submit_review` writes
 * through `saveReview`, the same function the scorecard POSTs; the agenda
 * writes go through the same `placeSession`/`swapSessions` the drag does.
 *
 * There used to be a per-surface allow-list here, on the argument that every
 * extra tool is one more thing a model can misread a sentence into. #683
 * dropped it: the assistant follows the user through the whole application, so
 * a list keyed to a page can only guess wrong. What replaces it is not a
 * weaker fence but the one that was always doing the work — authorization
 * inside each registry handler — plus approval before every write.
 */
import type { McpContext } from '$lib/server/mcp/context';
import { allTools } from '$lib/server/mcp/server';
import { writingToolNames, type AnyMcpToolDefinition } from '$lib/server/mcp/tool-helpers';
import type { Tool } from 'ai';
import { toLanguageModelTool } from './adapter';

export function assistantChatToolDefinitions(ctx: McpContext): AnyMcpToolDefinition[] {
	return allTools(ctx);
}

export function assistantChatWriteToolNames(ctx: McpContext): string[] {
	return writingToolNames(assistantChatToolDefinitions(ctx));
}

/**
 * `focus` is the scorecard's round, forwarded from the page the user has open
 * (#659, #683). It only ever pins the round of the submission the page is
 * about, and only after schema validation — see `bindReviewerFocus`. It cannot
 * widen anything: the registry handler still checks that this user reviews
 * that round, exactly as it does when the model names the round itself.
 */
export function assistantChatTools(
	ctx: McpContext,
	focus?: ReviewerToolFocus
): Record<string, Tool> {
	return Object.fromEntries(
		assistantChatToolDefinitions(ctx).map((def) => [
			def.name,
			toLanguageModelTool(def, {
				transformInput: (input) => bindReviewerFocus(def.name, input, focus)
			})
		])
	);
}

const ROUND_SCOPED = new Set<string>(['get_review_assignment', 'submit_review']);

export type ReviewerToolFocus = { submissionId: number; roundId: number };

/**
 * The page's round wins for tools aimed at the page's submission.
 *
 * `roundId` remains optional in the shared MCP schema because the reviewer
 * queue has no focused round. On a scorecard, however, falling back to the
 * first open round can write a different review than the one behind the panel.
 * The binding happens after schema validation and before the registry handler,
 * so an omitted or invented round cannot cross that page boundary.
 */
export function bindReviewerFocus(
	name: string,
	input: unknown,
	focus?: ReviewerToolFocus
): unknown {
	if (!focus || !ROUND_SCOPED.has(name) || !input || typeof input !== 'object') return input;
	const record = input as Record<string, unknown>;
	if (record.submissionId !== focus.submissionId) return input;
	return { ...record, roundId: focus.roundId };
}
