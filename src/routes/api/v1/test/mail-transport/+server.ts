/**
 * Arm or disarm the recording mail transport (#489).
 *
 * The `/api/v1/test` prefix is already 403 unless `ENABLE_TEST_ENDPOINTS=true`
 * — see `isTestEnvironment` in `hooks.server.ts`. That is the only thing
 * keeping this out of production. The handler still refuses to arm when the
 * flag is off, so a misplaced import cannot do it either.
 *
 * Off by default. Specs that need a live Send queued button turn it on after
 * they have queued mail (compose itself flushes, and would send immediately
 * if the fake were already armed).
 */
import {
	isTestMailTransportArmed,
	setTestMailTransport,
	testMailDeliveries
} from '$lib/server/conference/test-mail-transport';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
	if (typeof body?.enabled !== 'boolean') {
		return json({ error: 'enabled (boolean) is required' }, { status: 400 });
	}

	if (!setTestMailTransport(body.enabled)) {
		return json({ error: 'test mail transport is not available' }, { status: 403 });
	}

	return json({
		enabled: isTestMailTransportArmed(),
		delivered: testMailDeliveries().length
	});
};

export const GET: RequestHandler = async () => {
	return json({
		enabled: isTestMailTransportArmed(),
		delivered: testMailDeliveries().length
	});
};
