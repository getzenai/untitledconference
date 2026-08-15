/**
 * The tools the reviewer chat is allowed to call.
 *
 * The definitions live in the MCP registry (`allTools`). This file only
 * names the reviewer ones. `submit_review` writes through `saveReview` —
 * the same function the scorecard POSTs. Agenda tools and organizer
 * writes stay unwired (#302 step 3 is a different slice).
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
