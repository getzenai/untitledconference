/**
 * Translate one MCP tool definition into the AI SDK `tool()` shape.
 *
 * The chat does not grow a second registry. Names, descriptions and zod
 * input shapes come from `AnyMcpToolDefinition`; this file only changes the
 * wrapper the model calls.
 */
import { classifyError, type AnyMcpToolDefinition } from '$lib/server/mcp/tool-helpers';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

export function mcpInputSchema(def: AnyMcpToolDefinition) {
	return z.object(def.inputSchema as z.ZodRawShape);
}

/**
 * Run a tool the way the chat will: recognized refusals come back as
 * `{ error }` so the model can say so, instead of looking like a crash.
 * Unexpected errors still throw — those are bugs.
 */
export async function runMcpTool(
	def: AnyMcpToolDefinition,
	input: unknown
): Promise<Record<string, unknown>> {
	try {
		return await def.handler(input as never);
	} catch (error) {
		const { message, kind } = classifyError(def.name, error);
		if (kind === 'unexpected') throw error;
		return { error: message };
	}
}

export function toLanguageModelTool(
	def: AnyMcpToolDefinition,
	options: { transformInput?: (input: unknown) => unknown } = {}
): Tool {
	return tool({
		description: def.description,
		inputSchema: mcpInputSchema(def),
		execute: async (input) => runMcpTool(def, options.transformInput?.(input) ?? input)
	});
}
