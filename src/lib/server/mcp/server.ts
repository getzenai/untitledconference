import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerMcpTools, type AnyMcpToolDefinition } from './tool-helpers';
import { conferenceTools } from './tools/conference';
import { profileTools } from './tools/profile';

/**
 * Instructions handed to the calling agent on `initialize`. Describe what this
 * server is for and how its tools compose — it is the only guidance a model
 * gets before choosing a tool.
 */
export const SERVER_INSTRUCTIONS =
	'MCP server for untitledconference, a conference programme manager: ' +
	'call for proposals, review rounds, decisions, and the scheduled agenda. ' +
	'Tools act as the authenticated user and cover only the conferences they organize. ' +
	'Identity comes from the OAuth access token, so no tool takes a user or organization argument. ' +
	'Start with list_my_conferences — every other conference tool takes a slug it returns. ' +
	'To run a conference: create_conference (always a draft), update_conference for name/venue/dates, ' +
	'open_cfp then publish_conference so speakers can submit, invite_reviewer then assign_reviews, ' +
	'decide_submissions, then unpublish_conference to return to draft. ' +
	'From a conference: list_submissions for the proposals (filter by status), ' +
	'get_submission for one proposal in full with its reviews, ' +
	'and get_agenda for the scheduled programme. ' +
	'close_cfp stops new submissions without touching existing ones. ' +
	'get_my_profile and list_my_organizations describe the caller.';

/** Every tool, as protocol-free definitions. MCP and later REST both loop this. */
export function allTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [...profileTools(ctx), ...conferenceTools(ctx)];
}

/**
 * Register every MCP tool on a per-request server instance. `ctx` is the
 * resolved user/organization identity all tools are scoped to.
 */
export function registerAllTools(server: McpServer, ctx: McpContext): void {
	registerMcpTools(server, ctx, allTools(ctx));
}
