import { isRedirect } from '@sveltejs/kit';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

// The directory query is stubbed: what is under test is which of the two things
// the root load does, and importing the real module opens a database connection.
const publicConferenceDirectory = vi.fn();

vi.mock('$lib/conference/public-data', () => ({
	publicConferenceDirectory: () => publicConferenceDirectory()
}));

import { load } from './+page.server';
import Page from './+page.svelte';

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

describe('the front page a visitor sees', () => {
	// The loader tests above pass just as well against the old page, which was a
	// bare conference index. These pin what #5 actually asked for: the pitch, the
	// way in, and — still — a link to every published conference.
	const renderFrontPage = (conferences: { slug: string; name: string }[]) =>
		render(Page, {
			props: {
				data: {
					// The layout's data flows through the page's own `data` type; the
					// front page reads none of it.
					user: undefined,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conferences: conferences.map((c) => ({
						venue: 'Hall A',
						startsOn: '2027-05-12',
						endsOn: '2027-05-13',
						...c
					}))
				}
			}
		}).body;

	it('leads with what the tool does and how to start', () => {
		const body = renderFrontPage([{ slug: 'devflow-conf-2027', name: 'DevFlow Conf 2027' }]);

		expect(body).toContain('Run the whole conference.');
		expect(body).toContain('For speakers');
		expect(body).toContain('For reviewers');
		expect(body).toContain('For organizers');
		expect(body).toContain('Create your conference');
		// The mascot is inlined (not an <img src>) so it can take the site's
		// colors — check for the goose's own path data instead of a file path.
		expect(body).toContain('M50 4C60 4 66 11 66 21');
		// Two ways in, and neither may quietly disappear: the CTA for someone new,
		// the sign-in for someone who has been here.
		expect(body).toContain('href="/register"');
		expect(body).toContain('href="/login"');
	});

	it('still links every published conference, below the pitch', () => {
		const body = renderFrontPage([{ slug: 'devflow-conf-2027', name: 'DevFlow Conf 2027' }]);

		expect(body).toContain('href="/c/devflow-conf-2027"');
		expect(body).toContain('DevFlow Conf 2027');
		// Below, not above: this is the EMB start point, not the point of the page.
		expect(body).toContain('Run the whole conference.');
		expect(body.indexOf('Run the whole conference.')).toBeLessThan(
			body.indexOf('href="/c/devflow-conf-2027"')
		);
	});

	it('keeps the pitch when nothing is published yet', () => {
		const body = renderFrontPage([]);

		expect(body).toContain('Run the whole conference.');
		expect(body).toContain('Nothing published yet.');
	});
});
