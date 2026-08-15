/**
 * A slug that is not a conference must 404, same as `agenda.ics`.
 *
 * A `+server.ts` does not run the public layout's load, so this route does not
 * inherit that 404. Without the check it would reach `openCall` and, on a miss,
 * still have to answer for itself.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('the CFP deadline download', () => {
	it('answers 404 for an address that is not a conference', async () => {
		const slug = `no-such-conference-${Date.now()}`;
		const url = new URL(`https://untitled.test/c/${slug}/cfp.ics`);

		const event = {
			url,
			params: { slug },
			request: new Request(url),
			locals: {},
			setHeaders: () => {},
			route: { id: null }
		} as unknown as RequestEvent;

		await expect(GET(event as never)).rejects.toMatchObject({ status: 404 });
	});
});
