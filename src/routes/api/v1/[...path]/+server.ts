import { contextFromJwt, withMcpBearer } from '$lib/server/mcp/bearer';
import { dispatchRest } from '$lib/server/mcp/rest';
import type { RequestHandler } from '@sveltejs/kit';

async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		throw new Error('body must be a JSON object');
	} catch {
		throw new BodyError();
	}
}

class BodyError extends Error {
	constructor() {
		super('Request body must be a JSON object.');
		this.name = 'BodyError';
	}
}

function queryArgs(url: URL): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of url.searchParams) {
		out[key] = value;
	}
	return out;
}

function jsonResult(status: number, body: Record<string, unknown>, allow?: string): Response {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (allow) headers.Allow = allow;
	return new Response(JSON.stringify(body), { status, headers });
}

let cached: ((request: Request) => Promise<Response>) | undefined;

function handler(): (request: Request) => Promise<Response> {
	if (cached) return cached;
	cached = withMcpBearer(async (request, jwt) => {
		const ctxOrError = await contextFromJwt(jwt);
		if (ctxOrError instanceof Response) return ctxOrError;

		const url = new URL(request.url);
		const pathname = url.pathname.replace(/^\/api\/v1/, '') || '/';
		let body: Record<string, unknown> = {};
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			try {
				body = await readBody(request);
			} catch (error) {
				if (error instanceof BodyError) {
					return jsonResult(400, { error: error.message });
				}
				throw error;
			}
		}

		const result = await dispatchRest(request.method, pathname, ctxOrError, {
			query: queryArgs(url),
			body
		});
		return jsonResult(result.status, result.body, result.allow);
	});
	return cached;
}

const handle: RequestHandler = ({ request }) => handler()(request);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
