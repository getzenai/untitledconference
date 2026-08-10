import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

// The directory query is stubbed: what is under test is which of the two things
// the root load does, and importing the real module opens a database connection.
const publicConferenceDirectory = vi.fn();

vi.mock('$lib/conference/public-data', () => ({
	publicConferenceDirectory: () => publicConferenceDirectory()
}));

import { load } from './+page.server';

// `load` is typed as MaybePromise; wrapping keeps the awaits and the rejection
// assertions honest without an `any` at every call site.
const call = (locals: object) => Promise.resolve(load({ locals } as never));

describe('the front door', () => {
	it('gives the published conferences to a visitor without a session', async () => {
		// The regression this pins: `/` used to redirect here too, to /login, and no
		// page reachable from there linked a public conference site. Every EMB
		// scenario starts logged out at the base URL, so that redirect put all five
		// public surfaces out of reach of anyone who did not already know a slug.
		//
		// The page around this data is now a product page — the list moved below
		// the pitch and reads as evidence rather than as the point of the site —
		// but the loader's contract is exactly what it was, and it is the contract
		// the EMB start point depends on.
		publicConferenceDirectory.mockResolvedValue([
			{
				slug: 'devflow-conf-2027',
				name: 'DevFlow Conf 2027',
				venue: 'Hall A',
				startsOn: '2027-05-12',
				endsOn: '2027-05-13'
			}
		]);

		const result = await call({});

		expect(result).toEqual({
			conferences: [
				{
					slug: 'devflow-conf-2027',
					name: 'DevFlow Conf 2027',
					venue: 'Hall A',
					startsOn: '2027-05-12',
					endsOn: '2027-05-13'
				}
			]
		});
	});

	it('sends a signed-in user straight to their work', async () => {
		const thrown = await call({ user: { id: 'u1' } }).then(
			() => undefined,
			(e: unknown) => e
		);

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 303, location: '/home' });
	});

	it('does not query the directory for a signed-in user', async () => {
		publicConferenceDirectory.mockClear();

		await call({ user: { id: 'u1' } }).catch(() => undefined);

		expect(publicConferenceDirectory).not.toHaveBeenCalled();
	});
});
