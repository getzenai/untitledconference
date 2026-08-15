import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock the logger so the warn-vs-error level of a failed call can be asserted.
const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();
vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({
		info: (...args: unknown[]) => loggerInfo(...args),
		debug: vi.fn(),
		warn: (...args: unknown[]) => loggerWarn(...args),
		error: (...args: unknown[]) => loggerError(...args)
	})
}));

import { McpAuthError, type McpContext } from './context';
import { McpToolError, registerMcpTool, writingToolNames } from './tool-helpers';

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1', clientId: 'client-1' };

type CapturedCallback = (args: Record<string, unknown>) => Promise<CallToolResult>;

/**
 * Register a tool on a stub server that only captures the wrapped callback, so
 * the shared success/error mapping can be exercised without a transport.
 */
function runTool(handler: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
	let captured: CapturedCallback | undefined;
	const stubServer = {
		registerTool: (_name: string, _config: unknown, callback: CapturedCallback) => {
			captured = callback;
		}
	} as unknown as McpServer;

	registerMcpTool(stubServer, ctx, {
		name: 'test_tool',
		description: 'Test tool',
		writes: false,
		inputSchema: {},
		handler
	});

	if (!captured) throw new Error('registerTool was not called');
	return captured({});
}

function textOf(result: CallToolResult): string {
	const [first] = result.content as Array<{ type: string; text: string }>;
	expect(first.type).toBe('text');
	return first.text;
}

beforeEach(() => {
	loggerInfo.mockClear();
	loggerWarn.mockClear();
	loggerError.mockClear();
});

describe('registerMcpTool', () => {
	it('passes the tool name and description through to the server registration', () => {
		const registerTool = vi.fn();
		registerMcpTool({ registerTool } as unknown as McpServer, ctx, {
			name: 'get_my_profile',
			description: 'Get the profile of the authenticated user.',
			writes: false,
			inputSchema: {},
			handler: async () => ({})
		});

		expect(registerTool).toHaveBeenCalledWith(
			'get_my_profile',
			{ description: 'Get the profile of the authenticated user.', inputSchema: {} },
			expect.any(Function)
		);
	});

	it('returns the payload as JSON text content only (no structuredContent duplication)', async () => {
		const data = { count: 2, organizations: [{ id: 'a' }, { id: 'b' }] };
		const result = await runTool(async () => data);

		expect(result.isError).toBeUndefined();
		expect(JSON.parse(textOf(result))).toEqual(data);
		expect(result.structuredContent).toBeUndefined();
	});

	it('passes McpToolError messages through verbatim as isError results', async () => {
		const message = 'Your user account no longer exists.';
		const result = await runTool(async () => {
			throw new McpToolError(message);
		});

		expect(result.isError).toBe(true);
		expect(textOf(result)).toBe(message);
	});

	it('passes McpAuthError messages through verbatim as isError results', async () => {
		const message = 'This user is not a member of any organization.';
		const result = await runTool(async () => {
			throw new McpAuthError('no_organization', message);
		});

		expect(result.isError).toBe(true);
		expect(textOf(result)).toBe(message);
	});

	it('maps ZodError issues to a readable invalid-input message naming the field', async () => {
		const result = await runTool(async () => {
			z.object({ limit: z.number() }).parse({ limit: 'not-a-number' });
			return {};
		});

		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain('Invalid input:');
		expect(textOf(result)).toContain('limit');
	});

	it('maps unexpected errors to a generic message without leaking internals', async () => {
		// The agent is an untrusted audience: a raw error can carry a connection
		// string or a query. Only errors a tool raises deliberately are passed on.
		const result = await runTool(async () => {
			throw new Error('connection to postgres://user:password@host/db failed');
		});

		expect(result.isError).toBe(true);
		const text = textOf(result);
		expect(text).toContain('An unexpected error occurred while running test_tool');
		expect(text).not.toContain('password');
		expect(text).not.toContain('postgres://');
	});

	it('reports a payload that cannot be serialized as an error, not a success', async () => {
		// successResult JSON.stringifies the handler's return value; a BigInt throws.
		// Logging success before that point would record one call as both outcomes.
		const result = await runTool(async () => ({ total: 1n }));

		expect(result.isError).toBe(true);
		expect(loggerInfo).not.toHaveBeenCalled();
		expect(loggerError).toHaveBeenCalledTimes(1);
	});

	it('logs a recognized failure at warn, reserving error level for real bugs', async () => {
		await runTool(async () => {
			throw new McpToolError('Your user account no longer exists.');
		});

		expect(loggerWarn).toHaveBeenCalledTimes(1);
		expect(loggerError).not.toHaveBeenCalled();
		expect(loggerWarn.mock.calls[0][1]).toMatchObject({
			tool: 'test_tool',
			userId: 'user-1',
			organizationId: 'org-1',
			errorKind: 'tool_error'
		});
	});

	it('logs an unexpected failure at error with the raw error, so the stack survives', async () => {
		const thrown = new Error('connection to postgres://user:password@host/db failed');
		await runTool(async () => {
			throw thrown;
		});

		// The raw error must reach logger.error — the agent-facing message is
		// sanitized, so passing that instead would leave the failure undiagnosable.
		expect(loggerError).toHaveBeenCalledWith(
			expect.any(String),
			thrown,
			expect.objectContaining({ errorKind: 'unexpected' })
		);
		expect(loggerWarn).not.toHaveBeenCalled();
	});

	it('logs a successful call against the calling identity', async () => {
		await runTool(async () => ({ ok: true }));

		expect(loggerInfo).toHaveBeenCalledTimes(1);
		expect(loggerInfo.mock.calls[0][1]).toMatchObject({
			tool: 'test_tool',
			userId: 'user-1',
			organizationId: 'org-1',
			success: true
		});
	});
});

describe('writingToolNames', () => {
	it('returns only the tools that said they write', () => {
		expect(
			writingToolNames([
				{
					name: 'list_rooms',
					description: 'read',
					writes: false,
					inputSchema: {},
					handler: async () => ({})
				},
				{
					name: 'create_room',
					description: 'write',
					writes: true,
					inputSchema: {},
					handler: async () => ({})
				}
			])
		).toEqual(['create_room']);
	});
});
