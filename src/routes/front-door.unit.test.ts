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
// assertions honest without an `any` at every call site. The URL is real rather
// than a stub of `searchParams`: the bypass is read off the query string, and a
// hand-made object would let a typo in the parameter name pass.
const call = (locals: object, path = '/') =>
	Promise.resolve(load({ locals, url: new URL(path, 'https://example.test') } as never));

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
				endsOn: '2027-05-13',
				call: 'open'
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
					endsOn: '2027-05-13',
					call: 'open'
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

	it('lets a signed-in user through with ?home=0', async () => {
		// #237: the redirect was right and had no way out. A signed-in reader who
		// follows a link to the product page got the app instead, every time.
		publicConferenceDirectory.mockResolvedValue([]);

		const result = await call({ user: { id: 'u1' } }, '/?home=0');

		expect(result).toEqual({ conferences: [] });
	});

	it('still redirects when the parameter says anything else', async () => {
		// A bypass that any stray `?home=` triggers is not a bypass, it is a hole:
		// `/?home=1` is what a hand-edited URL looks like, and it means "yes, home".
		for (const query of ['/?home=1', '/?home', '/?home=false', '/?stay=1']) {
			const thrown = await call({ user: { id: 'u1' } }, query).then(
				() => undefined,
				(e: unknown) => e
			);

			expect(isRedirect(thrown), query).toBe(true);
		}
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
	const renderFrontPage = (
		conferences: { slug: string; name: string; call?: 'open' | 'closed' | 'none' }[],
		user?: { id: string }
	) =>
		render(Page, {
			props: {
				data: {
					// The layout's data flows through the page's own `data` type. The
					// page reads one field of it — `user` — and only to decide which
					// way out it offers (#237).
					user,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conferences: conferences.map((c) => ({
						venue: 'Hall A',
						startsOn: '2027-05-12',
						endsOn: '2027-05-13',
						call: 'none' as const,
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

	it('offers a signed-in reader the way back instead of a way in', () => {
		// Someone who reached this page through ?home=0 already has an account, so
		// "Sign in" and "Get started" are the two things they cannot use. What they
		// need is the door back — including on the logo, which plain `/` would turn
		// into a trapdoor straight to /home.
		const body = renderFrontPage([{ slug: 'devflow-conf-2027', name: 'DevFlow Conf 2027' }], {
			id: 'u1'
		});

		expect(body).toContain('Back to your work');
		expect(body).toContain('href="/?home=0"');
		// Neither of the two "you have no account yet" doors is left standing: the
		// header pair and the one in the footer. The register CTAs inside the pitch
		// stay — that is the page's argument, not a control aimed at this reader.
		expect(body).not.toContain('>Sign in<');
		expect(body).not.toContain('Get started');
		// The page itself is unchanged — it is still the product page.
		expect(body).toContain('Run the whole conference.');
		expect(body).toContain('href="/c/devflow-conf-2027"');
	});

	it('keeps the pitch when nothing is published yet', () => {
		const body = renderFrontPage([]);

		expect(body).toContain('Run the whole conference.');
		expect(body).toContain('Nothing published yet.');
	});

	it('points Explore a live conference at an open call, not the first card (#709)', () => {
		const body = renderFrontPage([
			{ slug: 'ai-engineer-summit-2025', name: 'AI Engineer Summit 2025', call: 'none' },
			{ slug: 'devflow-conf-2027', name: 'DevFlow Conf 2027', call: 'open' }
		]);

		expect(body).toContain('Explore a live conference');
		expect(body).toContain('href="/c/devflow-conf-2027"');
		expect(body).toContain('Call open');
		// The first listed card is still linked as proof — just not as the live CTA.
		expect(body).toContain('href="/c/ai-engineer-summit-2025"');
		const live = body.indexOf('Explore a live conference');
		const liveHref = body.lastIndexOf('href="/c/devflow-conf-2027"', live);
		expect(liveHref).toBeGreaterThan(-1);
		expect(body.slice(liveHref, live)).not.toContain('href="/c/ai-engineer-summit-2025"');
	});

	it('does not call a finished programme live when no call is open (#709)', () => {
		const body = renderFrontPage([
			{ slug: 'ai-engineer-summit-2025', name: 'AI Engineer Summit 2025', call: 'closed' }
		]);

		expect(body).not.toContain('Explore a live conference');
		expect(body).not.toContain('Call open');
		expect(body).toContain('See a published conference');
		expect(body).toContain('href="#live-events"');
	});
});
