import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerProfileTools } from './tools/profile';

/**
 * Instructions handed to the calling agent on `initialize`. Describe what this
 * server is for and how its tools compose — it is the only guidance a model
 * gets before choosing a tool.
 */
export const SERVER_INSTRUCTIONS =
	'Example MCP server for the SvelteKit vibe starter. ' +
	'Tools act as the authenticated user: get_my_profile returns that user, and ' +
	'list_my_organizations returns the organizations they belong to. ' +
	'Identity comes from the OAuth access token, so no tool takes a user or organization argument.';

/**
 * Register every MCP tool on a per-request server instance. `ctx` is the
 * resolved user/organization identity all tools are scoped to.
 *
 * Add your own `registerXTools(server, ctx)` calls here.
 */
export function registerAllTools(server: McpServer, ctx: McpContext): void {
	registerProfileTools(server, ctx);
}
