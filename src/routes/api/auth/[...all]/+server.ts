import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

// Handle all Better Auth API routes
export const GET: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};

export const POST: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};

export const PUT: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};

export const DELETE: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};
