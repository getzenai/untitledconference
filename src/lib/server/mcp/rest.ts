/**
 * REST adapter over the same tool list the MCP adapter loops.
 *
 * A route names a tool and how path / query / body become its arguments.
 * The handler is the one in `allTools` — there is no second implementation.
 */
import { createLogger } from '$lib/server/logger';
import { z } from 'zod';
import { McpAuthError, type McpContext } from './context';
import { allTools } from './server';
import { classifyError } from './tool-helpers';

const logger = createLogger('MCP');

export type RestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type RestRoute = {
	method: RestMethod;
	pattern: string;
	tool: string;
};

/**
 * Resource routes — readable paths, not `/tools/<name>`. Path params use the
 * same names the tool schema already has (`conferenceSlug`, `submissionId`).
 */
export const REST_ROUTES: RestRoute[] = [
	{ method: 'GET', pattern: '/conferences', tool: 'list_my_conferences' },
	{ method: 'POST', pattern: '/conferences', tool: 'create_conference' },
	{ method: 'PATCH', pattern: '/conferences/:conferenceSlug', tool: 'update_conference' },
	// DELETE is the archive, not the erase: it is what a REST caller means by
	// "delete this conference", and it is the reversible one. Erasing has no verb
	// of its own, so it is a POST to a named step — which is honest, because it is
	// not the same operation twice with a flag.
	//
	// The confirmation slug travels in the body — a URL that carries it twice would
	// be one nobody could type wrong, which is the opposite of what it is for.
	{ method: 'DELETE', pattern: '/conferences/:conferenceSlug', tool: 'archive_conference' },
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/restore', tool: 'restore_conference' },
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/erase', tool: 'delete_conference' },
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/publish', tool: 'publish_conference' },
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/unpublish',
		tool: 'unpublish_conference'
	},
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/cfp/open', tool: 'open_cfp' },
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/cfp/close', tool: 'close_cfp' },
	{
		method: 'GET',
		pattern: '/conferences/:conferenceSlug/submissions',
		tool: 'list_submissions'
	},
	{
		method: 'GET',
		pattern: '/conferences/:conferenceSlug/submissions/:submissionId',
		tool: 'get_submission'
	},
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/submissions/decisions',
		tool: 'decide_submissions'
	},
	{ method: 'GET', pattern: '/conferences/:conferenceSlug/rooms', tool: 'list_rooms' },
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/rooms', tool: 'create_room' },
	{ method: 'GET', pattern: '/conferences/:conferenceSlug/agenda', tool: 'get_agenda' },
	{
		method: 'GET',
		pattern: '/conferences/:conferenceSlug/agenda/tray',
		tool: 'get_agenda_tray'
	},
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/agenda/placements',
		tool: 'place_talk'
	},
	{
		method: 'PATCH',
		pattern: '/conferences/:conferenceSlug/agenda/placements/:placementId',
		tool: 'move_talk'
	},
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/agenda/placements/:placementId/swap',
		tool: 'swap_talks'
	},
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/agenda/placements/:placementId/unplace',
		tool: 'unplace_talk'
	},
	{ method: 'POST', pattern: '/conferences/:conferenceSlug/reviewers', tool: 'invite_reviewer' },
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/reviews/assignments',
		tool: 'assign_reviews'
	},
	{
		method: 'GET',
		pattern: '/conferences/:conferenceSlug/reviews/:submissionId',
		tool: 'get_review_assignment'
	},
	{
		method: 'POST',
		pattern: '/conferences/:conferenceSlug/reviews/:submissionId',
		tool: 'submit_review'
	},
	{ method: 'GET', pattern: '/cfps', tool: 'list_open_cfps' },
	{ method: 'POST', pattern: '/cfps/:conferenceSlug/submissions', tool: 'submit_proposal' },
	{ method: 'GET', pattern: '/me', tool: 'get_my_profile' },
	{ method: 'GET', pattern: '/me/organizations', tool: 'list_my_organizations' },
	{ method: 'GET', pattern: '/me/proposals', tool: 'list_my_proposals' },
	{
		method: 'PATCH',
		pattern: '/me/proposals/:submissionId',
		tool: 'update_proposal'
	},
	{
		method: 'POST',
		pattern: '/me/proposals/:submissionId/withdraw',
		tool: 'withdraw_proposal'
	},
	{ method: 'PATCH', pattern: '/me/speaker-profile', tool: 'update_my_speaker_profile' },
	{ method: 'GET', pattern: '/me/reviews', tool: 'list_my_review_assignments' }
];

export type MatchedRoute = {
	route: RestRoute;
	params: Record<string, string>;
};

export function matchRestRoute(method: string, pathname: string): MatchedRoute | null {
	const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
	for (const route of REST_ROUTES) {
		if (route.method !== method) continue;
		const params = matchPattern(route.pattern, path);
		if (params) return { route, params };
	}
	return null;
}

export function allowedMethods(pathname: string): RestMethod[] {
	const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
	const methods: RestMethod[] = [];
	for (const route of REST_ROUTES) {
		if (matchPattern(route.pattern, path) && !methods.includes(route.method)) {
			methods.push(route.method);
		}
	}
	return methods;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
	const patternParts = pattern.split('/').filter(Boolean);
	const pathParts = path.split('/').filter(Boolean);
	if (patternParts.length !== pathParts.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < patternParts.length; i++) {
		const expected = patternParts[i];
		const actual = pathParts[i];
		if (expected.startsWith(':')) {
			params[expected.slice(1)] = decodeURIComponent(actual);
			continue;
		}
		if (expected !== actual) return null;
	}
	return params;
}

/**
 * Path and query values arrive as strings. If zod says a field wanted a
 * number, turn the digit string into one and parse again. Anything else stays
 * a string so a bad slug is still a validation error, not a NaN.
 */
function coerceArgs(
	schema: Record<string, z.ZodTypeAny>,
	raw: Record<string, unknown>
): Record<string, unknown> {
	const first = z.object(schema).safeParse(raw);
	if (first.success) return raw;
	const next = { ...raw };
	for (const issue of first.error.issues) {
		const key = issue.path[0];
		if (typeof key !== 'string') continue;
		const value = next[key];
		if (typeof value !== 'string') continue;
		if (issue.code === 'invalid_type' && (issue as { expected?: string }).expected === 'number') {
			const n = Number(value);
			if (!Number.isNaN(n)) next[key] = n;
		}
	}
	return next;
}

export type InvokeResult =
	| { ok: true; status: 200; body: Record<string, unknown> }
	| { ok: false; status: 400 | 401 | 403 | 404 | 500; body: { error: string } };

export async function invokeTool(
	ctx: McpContext,
	name: string,
	rawArgs: Record<string, unknown>
): Promise<InvokeResult> {
	const tool = allTools(ctx).find((entry) => entry.name === name);
	if (!tool) {
		return { ok: false, status: 404, body: { error: `No tool "${name}".` } };
	}

	const schema = tool.inputSchema as Record<string, z.ZodTypeAny>;
	const parsed = z.object(schema).safeParse(coerceArgs(schema, rawArgs));
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
			.join('; ');
		return { ok: false, status: 400, body: { error: `Invalid input: ${issues}` } };
	}

	const start = performance.now();
	try {
		const body = await tool.handler(parsed.data);
		return { ok: true, status: 200, body };
	} catch (error) {
		const { message, kind } = classifyError(name, error);
		const logContext = {
			tool: name,
			userId: ctx.userId,
			organizationId: ctx.organizationId,
			durationMs: Math.round(performance.now() - start),
			success: false,
			errorKind: kind
		};
		if (kind === 'unexpected') {
			logger.error('MCP tool call failed unexpectedly', error, logContext);
			return { ok: false, status: 500, body: { error: 'Internal error' } };
		}
		logger.warn('MCP tool call returned error', {
			...logContext,
			error: message,
			cause: error instanceof Error ? error.message : String(error)
		});
		if (error instanceof McpAuthError) {
			return {
				ok: false,
				status: error.code === 'no_user' ? 401 : 403,
				body: { error: message }
			};
		}
		return { ok: false, status: 400, body: { error: message } };
	}
}

export async function dispatchRest(
	method: string,
	pathname: string,
	ctx: McpContext,
	input: { query?: Record<string, unknown>; body?: Record<string, unknown> }
): Promise<{ status: number; body: Record<string, unknown>; allow?: string }> {
	const matched = matchRestRoute(method, pathname);
	if (!matched) {
		const allow = allowedMethods(pathname);
		if (allow.length > 0) {
			return {
				status: 405,
				body: { error: `Method ${method} not allowed.` },
				allow: allow.join(', ')
			};
		}
		return { status: 404, body: { error: 'Not found.' } };
	}

	const args: Record<string, unknown> = {
		...input.query,
		...input.body,
		...matched.params
	};
	const result = await invokeTool(ctx, matched.route.tool, args);
	return { status: result.status, body: result.body };
}
