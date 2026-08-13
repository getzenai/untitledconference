import { getServerOrigin } from '$lib/auth';
import { buildOpenApiDocument } from '$lib/server/mcp/openapi';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
	return Response.json(buildOpenApiDocument(getServerOrigin()), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
