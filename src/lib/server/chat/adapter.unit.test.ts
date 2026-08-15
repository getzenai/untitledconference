import type { McpContext } from '$lib/server/mcp/context';
import { allTools } from '$lib/server/mcp/server';
import { McpToolError, type AnyMcpToolDefinition } from '$lib/server/mcp/tool-helpers';
import { describe, expect, it } from 'vitest';
import { mcpInputSchema, runMcpTool, toLanguageModelTool } from './adapter';
import { REVIEWER_CHAT_TOOL_NAMES, reviewerChatTools, reviewerReadTools } from './tools';

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1' };

describe('toLanguageModelTool', () => {
	it('takes names and zod schemas from the MCP registry', () => {
		const registry = allTools(ctx);
		const adapted = reviewerChatTools(ctx);

		expect(Object.keys(adapted).sort()).toEqual([...REVIEWER_CHAT_TOOL_NAMES].sort());

		for (const name of REVIEWER_CHAT_TOOL_NAMES) {
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

	it('wires submit_review from the registry and leaves organizer writes unwired', () => {
		const names = new Set(Object.keys(reviewerChatTools(ctx)));
		const registry = allTools(ctx).map((tool) => tool.name);
		expect(registry).toContain('submit_review');
		expect(registry).toContain('decide_submissions');
		expect(names.has('submit_review')).toBe(true);
		expect(names.has('decide_submissions')).toBe(false);
		expect(Object.keys(reviewerReadTools(ctx))).not.toContain('submit_review');
	});

	it('returns a recognized refusal as { error } instead of throwing', async () => {
		const def: AnyMcpToolDefinition = {
			name: 'get_review_assignment',
			description: 'test',
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
