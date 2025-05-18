import { db } from '$lib/server/db';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		// Perform a simple query to check database connectivity
		await db.execute(sql`SELECT 1`);
		return json(
			{
				status: 'ok',
				timestamp: new Date().toISOString(),
				checks: [{ name: 'database', status: 'ok' }]
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Health check failed:', error);
		let errorMessage = 'unknown error';
		if (error instanceof Error) {
			errorMessage = error.message;
		}
		return json(
			{
				status: 'error',
				timestamp: new Date().toISOString(),
				checks: [{ name: 'database', status: 'unreachable', error: errorMessage }]
			},
			{ status: 503 } // Service Unavailable
		);
	}
};
