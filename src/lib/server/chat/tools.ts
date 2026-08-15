/**
 * The tools each chat surface is allowed to call.
 *
 * The definitions live in the MCP registry (`allTools`). This file only
 * names them per surface. `submit_review` writes through `saveReview` —
 * the same function the scorecard POSTs; the agenda writes go through the
 * same `placeSession`/`swapSessions` the drag does. The chat gets no tool
 * layer of its own: that is the whole point of #302.
 *
 * A surface is a list, not a role. The organizer chat on the agenda is
 * handed the agenda tools and nothing else — a talk cannot be decided or a
 * conference published from a board the organizer opened to move a talk.
 */
import type { McpContext } from '$lib/server/mcp/context';
import { allTools } from '$lib/server/mcp/server';
import type { AnyMcpToolDefinition } from '$lib/server/mcp/tool-helpers';
import type { Tool } from 'ai';
import { toLanguageModelTool } from './adapter';

export const REVIEWER_READ_TOOL_NAMES = [
	'list_my_review_assignments',
	'get_review_assignment'
] as const;

export const REVIEWER_WRITE_TOOL_NAMES = ['submit_review'] as const;

export const REVIEWER_CHAT_TOOL_NAMES = [
	...REVIEWER_READ_TOOL_NAMES,
	...REVIEWER_WRITE_TOOL_NAMES
] as const;

export type ReviewerChatToolName = (typeof REVIEWER_CHAT_TOOL_NAMES)[number];

const ALLOWED = new Set<string>(REVIEWER_CHAT_TOOL_NAMES);

export function reviewerChatToolDefinitions(ctx: McpContext): AnyMcpToolDefinition[] {
	return allTools(ctx).filter((tool) => ALLOWED.has(tool.name));
}

/** @deprecated Use reviewerChatToolDefinitions — kept for the read-path tests. */
export function reviewerReadToolDefinitions(ctx: McpContext): AnyMcpToolDefinition[] {
	return reviewerChatToolDefinitions(ctx).filter((tool) =>
		(REVIEWER_READ_TOOL_NAMES as readonly string[]).includes(tool.name)
	);
}

export function reviewerChatTools(ctx: McpContext): Record<string, Tool> {
	return Object.fromEntries(
		reviewerChatToolDefinitions(ctx).map((def) => [def.name, toLanguageModelTool(def)])
	);
}

export function reviewerReadTools(ctx: McpContext): Record<string, Tool> {
	return Object.fromEntries(
		reviewerReadToolDefinitions(ctx).map((def) => [def.name, toLanguageModelTool(def)])
	);
}

/**
 * The board as the organizer sees it: rooms, the tray of accepted talks that
 * are still unplaced, and every placement including the tentative ones the
 * public agenda hides.
 */
export const AGENDA_READ_TOOL_NAMES = ['list_rooms', 'get_agenda_tray', 'get_agenda'] as const;

/**
 * The four writes a drag can already do. Breaks and rooms are left out on
 * purpose: this chat sits on the board to schedule talks, and every tool in
 * the list is one more thing the model can misread a sentence into.
 */
export const AGENDA_WRITE_TOOL_NAMES = [
	'place_talk',
	'move_talk',
	'swap_talks',
	'unplace_talk'
] as const;

export const AGENDA_CHAT_TOOL_NAMES = [
	...AGENDA_READ_TOOL_NAMES,
	...AGENDA_WRITE_TOOL_NAMES
] as const;

export type AgendaChatToolName = (typeof AGENDA_CHAT_TOOL_NAMES)[number];

const AGENDA_ALLOWED = new Set<string>(AGENDA_CHAT_TOOL_NAMES);

export function agendaChatToolDefinitions(ctx: McpContext): AnyMcpToolDefinition[] {
	return allTools(ctx).filter((tool) => AGENDA_ALLOWED.has(tool.name));
}

export function agendaChatTools(ctx: McpContext): Record<string, Tool> {
	return Object.fromEntries(
		agendaChatToolDefinitions(ctx).map((def) => [def.name, toLanguageModelTool(def)])
	);
}
