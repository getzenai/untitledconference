/**
 * The public tab bar after Speakers and Gallery became one screen (#57).
 *
 * Two things have to hold together and pull in opposite directions: the bar has
 * one Speakers tab now, and /gallery is still a real, embeddable URL. A tab bar
 * that drops the Gallery tab *and* forgets that /gallery belongs to Speakers
 * leaves a visitor on a page the navigation denies they are on.
 */
import { FIXTURE_CONFERENCE } from '$lib/conference/public-fixtures';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ value: '/c/untitled-2026/speakers' }));

vi.mock('$app/state', () => ({
	get page() {
		return { url: new URL(`https://example.test${pathname.value}`) };
	}
}));

async function body(path: string, call: unknown = null) {
	pathname.value = path;
	const empty = (() => '') as unknown as import('svelte').Snippet;
	const { default: Layout } = await import('./+layout.svelte');
	return render(Layout, {
		props: {
			data: {
				conference: FIXTURE_CONFERENCE,
				call,
				daysUntilClose: null,
				embed: false
			} as never,
			children: empty
		}
	}).body;
}

/** The tab this issue is about only exists when there is a call to open (#617). */
const withCall = (path: string) => body(path, { state: 'open' });

const base = `/c/${FIXTURE_CONFERENCE.slug}`;

describe('public tab bar', () => {
	it('offers one Speakers tab and no Gallery tab', async () => {
		const html = await body(`${base}/speakers`);

		expect(html).toContain(`href="${base}/speakers"`);
		expect(html).not.toContain(`href="${base}/gallery"`);
		// The other three widget surfaces are untouched by the merge.
		expect(html).toContain(`href="${base}/agenda"`);
		expect(html).toContain(`href="${base}/itinerary"`);
	});

	it('lights the Speakers tab while the visitor is in the gallery', async () => {
		const html = await body(`${base}/gallery`);

		expect(html).toMatch(/href="\/c\/[^"]+\/speakers"[^>]*aria-current="page"/);
	});

	it('still lights it on a speaker detail page', async () => {
		const html = await body(`${base}/speakers/grace-hopper`);

		expect(html).toMatch(/href="\/c\/[^"]+\/speakers"[^>]*aria-current="page"/);
	});

	it('marks nothing on the index but the index itself', async () => {
		const html = await body(base);

		expect(html).toMatch(/href="\/c\/[^"]+"[^>]*aria-current="page"/);
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
	});

	it('lets the tab bar scroll sideways on a narrow phone instead of wrapping', async () => {
		const html = await body(`${base}/agenda`);

		expect(html).toContain('overflow-x-auto');
		expect(html).toContain('whitespace-nowrap');
	});

	it('shortens the call tab on a phone without losing its name (#617)', async () => {
		const html = await withCall(`${base}/cfp`);

		// Both halves ship, and each is hidden from exactly one audience: the eye
		// sees "CFP" and never hears it, a screenreader reads "Call for papers" and
		// never sees the abbreviation. A tab that shipped only the short form would
		// pass a width check and rename the page for everyone who cannot see it.
		expect(html).toMatch(/aria-hidden="true"[^>]*class="[^"]*sm:hidden[^"]*">CFP</);
		expect(html).toMatch(/class="[^"]*sr-only sm:not-sr-only[^"]*">Call for papers</);
	});

	it('leaves the four one-word tabs alone', async () => {
		const html = await withCall(base);

		// The short form is a fix for one label, not a style. Sessions, Agenda,
		// Itinerary and Speakers already fit at 390 px; abbreviating them would cost
		// clarity for nothing.
		expect(html.match(/aria-hidden="true"[^>]*sm:hidden/g)).toHaveLength(1);
	});

	it('closes the gaps on a phone and keeps them on a desktop', async () => {
		const html = await withCall(base);

		// 24 px of gap around five tabs is what pushed the last one off a 390 px
		// screen even after the label got shorter — measured at 390.06 px of content
		// in 390 px of screen. 16 px below `sm` buys the 32 px of headroom.
		expect(html).toMatch(/class="[^"]*\bgap-4\b[^"]*\bsm:gap-6\b/);
	});
});
