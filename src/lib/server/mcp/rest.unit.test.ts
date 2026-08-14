import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerError = vi.fn();
const loggerWarn = vi.fn();
vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: (...args: unknown[]) => loggerWarn(...args),
		error: (...args: unknown[]) => loggerError(...args)
	})
}));

const { allToolsMock } = vi.hoisted(() => ({ allToolsMock: vi.fn() }));
vi.mock('./server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./server')>();
	allToolsMock.mockImplementation(actual.allTools);
	return { ...actual, allTools: allToolsMock };
});

import { buildOpenApiDocument } from './openapi';
import { allowedMethods, invokeTool, matchRestRoute, REST_ROUTES } from './rest';
import { allTools } from './server';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

beforeEach(() => {
	loggerError.mockClear();
	loggerWarn.mockClear();
	allToolsMock.mockClear();
});

describe('the REST route table', () => {
	it('names only tools that exist in the registry', () => {
		const names = new Set(allTools(ctx).map((tool) => tool.name));
		for (const route of REST_ROUTES) {
			expect(names.has(route.tool), route.tool).toBe(true);
		}
	});

	it('maps the resource paths the issue names onto the same tools', () => {
		expect(matchRestRoute('GET', '/conferences')?.route.tool).toBe('list_my_conferences');
		expect(matchRestRoute('GET', '/conferences/harness/submissions')?.route.tool).toBe(
			'list_submissions'
		);
		expect(matchRestRoute('POST', '/conferences/harness/submissions/decisions')?.route.tool).toBe(
			'decide_submissions'
		);
		expect(
			matchRestRoute('POST', '/conferences/harness/submissions/notifications')?.route.tool
		).toBe('notify_speakers');
		expect(matchRestRoute('GET', '/conferences/harness/agenda')?.route.tool).toBe('get_agenda');
		expect(matchRestRoute('GET', '/conferences/harness/rooms')?.route.tool).toBe('list_rooms');
		expect(matchRestRoute('POST', '/conferences/harness/review-rounds')?.route.tool).toBe(
			'create_review_round'
		);
		expect(matchRestRoute('GET', '/conferences/harness/reviewers')?.route.tool).toBe(
			'list_reviewers'
		);
		expect(matchRestRoute('DELETE', '/conferences/harness/reviewers')?.route.tool).toBe(
			'remove_reviewer'
		);
		expect(matchRestRoute('GET', '/conferences/harness/formats')?.route.tool).toBe(
			'list_session_formats'
		);
		expect(matchRestRoute('POST', '/conferences/harness/tracks')?.route.tool).toBe('create_track');
		expect(matchRestRoute('POST', '/conferences/harness/agenda/placements')?.route.tool).toBe(
			'place_talk'
		);
	});

	it('keeps speaker writes under /me/proposals, not the organizer submission path', () => {
		expect(matchRestRoute('GET', '/conferences/harness/submissions/12')?.route.tool).toBe(
			'get_submission'
		);
		expect(matchRestRoute('PATCH', '/conferences/harness/submissions/12')).toBeNull();
		expect(allowedMethods('/conferences/harness/submissions/12')).toEqual(['GET']);
		expect(matchRestRoute('PATCH', '/me/proposals/12')?.route.tool).toBe('update_proposal');
		expect(matchRestRoute('POST', '/me/proposals/12/withdraw')?.route.tool).toBe(
			'withdraw_proposal'
		);
	});

	it('answers 405 with Allow when the path exists for another method', () => {
		expect(allowedMethods('/conferences').sort()).toEqual(['GET', 'POST']);
		expect(allowedMethods('/conferences/harness/reviewers').sort()).toEqual([
			'DELETE',
			'GET',
			'POST'
		]);
		expect(matchRestRoute('DELETE', '/conferences')).toBeNull();
	});

	it('does not invent an RPC /tools/<name> path', () => {
		expect(matchRestRoute('POST', '/tools/list_my_conferences')).toBeNull();
	});

	it('publishes every route in the OpenAPI document', () => {
		const spec = buildOpenApiDocument('https://example.test') as {
			paths: Record<string, Record<string, { operationId?: string }>>;
		};
		for (const route of REST_ROUTES) {
			const path = `/api/v1${route.pattern.replace(/:([A-Za-z]+)/g, '{$1}')}`;
			expect(spec.paths[path]?.[route.method.toLowerCase()]?.operationId, path).toBe(
				route.operationId ?? route.tool
			);
		}
	});

	// The reason `operationId` exists on a route at all: the second way to reach
	// `archive_conference` would otherwise publish the tool name twice, and a
	// document with two operations under one id is one many generators refuse.
	it('gives every published operation its own id', () => {
		const ids = REST_ROUTES.map((route) => route.operationId ?? route.tool);

		expect(new Set(ids).size).toBe(ids.length);
	});

	// A write reads its arguments from the body. Stated as a property of the
	// table rather than of one call, because the fault it prevents — a
	// confirmation that a URL can carry — is one any future route could reopen.
	it('offers a confirmed archive that does not need a DELETE body', () => {
		const matched = matchRestRoute('POST', '/conferences/hallway/archive');

		expect(matched?.route.tool).toBe('archive_conference');
		expect(matched?.params).toEqual({ conferenceSlug: 'hallway' });
	});
});

describe('invokeTool', () => {
	it('refuses unknown tools with 404', async () => {
		const result = await invokeTool(ctx, 'not_a_tool', {});
		expect(result).toMatchObject({ ok: false, status: 404 });
	});

	it('turns a zod failure into 400', async () => {
		const result = await invokeTool(ctx, 'create_conference', { name: '' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(400);
		expect(result.body.error).toContain('Invalid input');
	});

	it('coerces a digit string so a path id reaches the number field', async () => {
		const result = await invokeTool(ctx, 'get_submission', {
			conferenceSlug: 'x',
			submissionId: '12'
		});
		// Auth/organizer failure, not "expected number, received string".
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.body.error).not.toContain('expected number');
	});

	it('logs an unexpected failure at error so a REST 500 is diagnosable', async () => {
		const thrown = new Error('connection to postgres://user:password@host/db failed');
		allToolsMock.mockReturnValueOnce([
			{
				name: 'boom',
				description: 'boom',
				inputSchema: {},
				handler: async () => {
					throw thrown;
				}
			}
		]);

		const result = await invokeTool(ctx, 'boom', {});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(500);
		expect(result.body.error).toBe('Internal error');
		expect(loggerError).toHaveBeenCalledWith(
			'MCP tool call failed unexpectedly',
			thrown,
			expect.objectContaining({ tool: 'boom', errorKind: 'unexpected' })
		);
		expect(loggerWarn).not.toHaveBeenCalled();
	});
});
