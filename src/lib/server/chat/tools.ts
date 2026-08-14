/**
 * The tools the reviewer chat is allowed to call.
 *
 * The definitions themselves live in the MCP registry (`allTools`). This
 * file only names the read-only reviewer ones. Anything that writes — even
 * `submit_review`, even `decide_submissions` which sits in
 * `conferenceReadTools` — stays unwired until the next slice.
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

export type ReviewerReadToolName = (typeof REVIEWER_READ_TOOL_NAMES)[number];

const READ_ONLY = new Set<string>(REVIEWER_READ_TOOL_NAMES);

export function reviewerReadToolDefinitions(ctx: McpContext): AnyMcpToolDefinition[] {
	return allTools(ctx).filter((tool) => READ_ONLY.has(tool.name));
}

export function reviewerReadTools(ctx: McpContext): Record<string, Tool> {
	return Object.fromEntries(
		reviewerReadToolDefinitions(ctx).map((def) => [def.name, toLanguageModelTool(def)])
	);
}
