/**
 * The one case the unit test next door cannot reach.
 *
 * A slug that is not the design fixture goes to the database, so "there is no
 * conference at this address" is only answerable with one connected. It is here on
 * its own rather than as part of a larger fixture because the answer must not
 * depend on any row existing — that is the whole assertion.
 *
 * It matters more than it looks: a `+server.ts` does not run the layout load, so
 * this route does not inherit the layout's 404. Without the check it would reach
 * `buildView(null)` and answer 500 to anyone typing a wrong address.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('the agenda feed', () => {
	it('answers 404 for an address that is not a conference', async () => {
		const slug = `no-such-conference-${Date.now()}`;
		const url = new URL(`https://untitled.test/c/${slug}/agenda.ics`);

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
