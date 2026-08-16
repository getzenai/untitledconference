import type { McpContext } from '$lib/server/mcp/context';
import { allTools } from '$lib/server/mcp/server';
import { McpToolError, type AnyMcpToolDefinition } from '$lib/server/mcp/tool-helpers';
import { describe, expect, it } from 'vitest';
import { mcpInputSchema, runMcpTool, toLanguageModelTool } from './adapter';
import { assistantChatTools, assistantChatWriteToolNames } from './tools';

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1' };

describe('toLanguageModelTool', () => {
	it('takes names and zod schemas from the MCP registry', () => {
		const registry = allTools(ctx);
		const adapted = assistantChatTools(ctx);

		expect(Object.keys(adapted).sort()).toEqual(registry.map((tool) => tool.name).sort());

		for (const name of ['list_my_review_assignments', 'get_review_assignment', 'submit_review']) {
			const def = registry.find((tool) => tool.name === name);
			expect(def, name).toBeDefined();
			const schema = mcpInputSchema(def!);
			const adaptedTool = adapted[name];
			expect(adaptedTool.description).toBe(def!.description);
			// Same keys the registry declared — the adapter did not invent a schema.
			expect(Object.keys(schema.shape).sort()).toEqual(Object.keys(def!.inputSchema).sort());
		}

		const assignment = registry.find((tool) => tool.name === 'get_review_assignment')!;
		const parsed = mcpInputSchema(assignment).safeParse({});
		expect(parsed.success).toBe(false);
	});

	// The allow-list is gone (#683): a reviewer is offered `decide_submissions`
	// like everyone else, and is refused by the handler rather than by absence.
	// What must not go is the approval gate — a write the model reaches without
	// asking is the failure this replaced the list with.
	it('wires every registry tool, with the writes marked as writes', () => {
		const names = new Set(Object.keys(assistantChatTools(ctx)));
		expect(names.has('submit_review')).toBe(true);
		expect(names.has('decide_submissions')).toBe(true);

		const writes = assistantChatWriteToolNames(ctx);
		expect(writes).toContain('submit_review');
		expect(writes).toContain('decide_submissions');
		expect(writes).not.toContain('list_my_review_assignments');
	});

	it('returns a recognized refusal as { error } instead of throwing', async () => {
		const def: AnyMcpToolDefinition = {
			name: 'get_review_assignment',
			description: 'test',
			writes: false,
			inputSchema: {},
			handler: async () => {
				throw new McpToolError('No conference "other" that you review for.');
			}
		};
		const result = await runMcpTool(def, {});
		expect(result).toEqual({ error: 'No conference "other" that you review for.' });
		expect(toLanguageModelTool(def).execute).toEqual(expect.any(Function));
	});
});
