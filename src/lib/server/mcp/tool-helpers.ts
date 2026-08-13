import { createLogger } from '$lib/server/logger';
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
	ShapeOutput,
	ZodRawShapeCompat
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { McpAuthError, type McpContext } from './context';

const logger = createLogger('MCP');

/**
 * Error whose message is safe and actionable for the calling agent — it is
 * returned verbatim as an `isError` tool result. Anything else a tool throws is
 * logged server-side and replaced with a generic message, so internal details
 * (connection strings, stack traces) never reach the model.
 */
export class McpToolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'McpToolError';
	}
}

export interface McpToolDefinition<Shape extends ZodRawShapeCompat> {
	name: string;
	description: string;
	inputSchema: Shape;
	handler: (args: ShapeOutput<Shape>) => Promise<Record<string, unknown>>;
}

function successResult(data: Record<string, unknown>): CallToolResult {
	// Serialized text content only — no structuredContent, which would duplicate
	// the whole payload in the response.
	return {
		content: [{ type: 'text', text: JSON.stringify(data) }]
	};
}

function errorResult(message: string): CallToolResult {
	return {
		isError: true,
		content: [{ type: 'text', text: message }]
	};
}

/**
 * Why a call failed. Deliberately coarse — it distinguishes errors we recognize
 * from real bugs, which is what decides the log level.
 *
 * `invalid_input` and `auth` do not fire on the normal path: the SDK rejects
 * schema-invalid arguments before this wrapper runs, and McpAuthError is handled
 * by the route before any tool is registered. They are kept so an error that
 * does reach here is never miscounted as `unexpected`.
 */
export type McpErrorKind = 'auth' | 'invalid_input' | 'tool_error' | 'unexpected';

/**
 * Map a thrown error to the message the agent sees and the kind we log it as.
 * One chain, so the two can never disagree: everything but `unexpected` is an
 * error we recognize, which is exactly what skips the error log.
 *
 * Subclasses must come before their base, or they collapse into `tool_error`.
 */
function classifyError(toolName: string, error: unknown): { message: string; kind: McpErrorKind } {
	if (error instanceof McpAuthError) return { message: error.message, kind: 'auth' };
	if (error instanceof z.ZodError) {
		const issues = error.issues
			.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
			.join('; ');
		return { message: `Invalid input: ${issues}`, kind: 'invalid_input' };
	}
	if (error instanceof McpToolError) return { message: error.message, kind: 'tool_error' };
	return {
		message: `An unexpected error occurred while running ${toolName}. Try again; if the problem persists, contact support.`,
		kind: 'unexpected'
	};
}

/**
 * Register a tool on the server with the behavior every MCP tool here shares:
 * JSON success payloads serialized into the text content, error mapping to
 * `isError` results, and structured per-call logging scoped to the caller.
 *
 * Tools stay plain async functions returning a plain object — this wrapper owns
 * the protocol shape, so a tool never builds a CallToolResult itself.
 */
/** Protocol-free tool list item. The MCP adapter loops this; REST will too. */
export type AnyMcpToolDefinition = McpToolDefinition<ZodRawShapeCompat>;

export function registerMcpTools(
	server: McpServer,
	ctx: McpContext,
	tools: readonly AnyMcpToolDefinition[]
): void {
	for (const tool of tools) {
		registerMcpTool(server, ctx, tool);
	}
}

export function registerMcpTool<Shape extends ZodRawShapeCompat>(
	server: McpServer,
	ctx: McpContext,
	tool: McpToolDefinition<Shape>
): void {
	const callback = async (args: ShapeOutput<Shape>): Promise<CallToolResult> => {
		const start = performance.now();
		try {
			const result = await tool.handler(args);
			// Serialize before logging success: successResult can throw (a BigInt or
			// a circular reference in the payload), and logging a success first would
			// record one call as both a success and a failure.
			const response = successResult(result);
			logger.info('MCP tool call succeeded', {
				tool: tool.name,
				userId: ctx.userId,
				organizationId: ctx.organizationId,
				durationMs: Math.round(performance.now() - start),
				success: true
			});
			return response;
		} catch (error) {
			const { message, kind } = classifyError(tool.name, error);
			const logContext = {
				tool: tool.name,
				userId: ctx.userId,
				organizationId: ctx.organizationId,
				durationMs: Math.round(performance.now() - start),
				success: false,
				errorKind: kind
			};
			if (kind === 'unexpected') {
				logger.error('MCP tool call failed unexpectedly', error, logContext);
			} else {
				logger.warn('MCP tool call returned error', {
					...logContext,
					error: message,
					// The agent-facing message may be reworded (validation issues); keep
					// the underlying cause diagnosable at warn level.
					cause: error instanceof Error ? error.message : String(error)
				});
			}
			return errorResult(message);
		}
	};

	server.registerTool(
		tool.name,
		{ description: tool.description, inputSchema: tool.inputSchema },
		// ToolCallback<Shape> is a conditional type TypeScript cannot resolve while
		// Shape is still generic; the callback matches its resolved form.
		callback as unknown as ToolCallback<Shape>
	);
}
