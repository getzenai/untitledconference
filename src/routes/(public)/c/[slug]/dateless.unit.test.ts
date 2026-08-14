/**
 * A published conference with no dates (#492).
 *
 * The date column is nullable — `/manage/new` takes a name alone, and Settings
 * offers Publish without ever asking for dates. The public header formatted
 * those nulls anyway and threw, so `/c/<slug>` and every page under it answered
 * 500 while the organizer view said "Published". The organizer heard about it
 * from a speaker.
 *
 * Rendering, not loading, is what broke, so this renders: the header on an
 * inner page, and the hero on the index.
 */
import { FIXTURE_CONFERENCE } from '$lib/conference/public-fixtures';
import { buildView, formatDateRange } from '$lib/conference/public-view';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ value: '/c/untitled-2026/agenda' }));

vi.mock('$app/state', () => ({
	get page() {
		return { url: new URL(`https://example.test${pathname.value}`) };
	}
}));

const dateless = { ...FIXTURE_CONFERENCE, startsOn: null, endsOn: null };

async function headerBody(conference: typeof FIXTURE_CONFERENCE) {
	pathname.value = `/c/${conference.slug}/agenda`;
	const empty = (() => '') as unknown as import('svelte').Snippet;
	const { default: Layout } = await import('./+layout.svelte');
	return render(Layout, {
		props: {
			data: { conference, call: null, daysUntilClose: null, embed: false } as never,
			children: empty
		}
	}).body;
}

async function heroBody(conference: typeof FIXTURE_CONFERENCE) {
	const { default: Hero } = await import('$lib/components/app/conference/conference-hero.svelte');
	// Through the formatter the index actually calls, not a hand-passed null:
	// the crash lived in that call, not in the component.
	return render(Hero, {
		props: {
			view: buildView(conference),
			dateRange: formatDateRange(conference),
			callIsOpen: false
		} as never
	}).body;
}

describe('a conference published before its dates are fixed', () => {
	it('still renders the header on an inner page, without a date line', async () => {
		const html = await headerBody(dateless);

		expect(html).toContain(dateless.name);
		// The two shapes the old code produced instead of nothing: the loader's
		// `?? ''` became "Invalid Date" and threw, a raw null became 1 January 1970.
		expect(html).not.toContain('Invalid Date');
		expect(html).not.toContain('1970');
	});

	it('keeps the venue on that line even with no dates, and drops the separator', async () => {
		const html = await headerBody({ ...dateless, venue: 'Kongresshalle' });

		expect(html).toContain('Kongresshalle');
		// The "·" only ever joined two halves; with one half gone it would dangle.
		expect(html).not.toMatch(/>·<\/span>\s*Kongresshalle/);
	});

	it('still renders the hero on the index, without a date line', async () => {
		const html = await heroBody(dateless);

		expect(html).toContain(dateless.name);
		// The two shapes the old code produced instead of nothing: the loader's
		// `?? ''` became "Invalid Date" and threw, a raw null became 1 January 1970.
		expect(html).not.toContain('Invalid Date');
		expect(html).not.toContain('1970');
	});

	it('still says the dates when there are dates', async () => {
		const html = await headerBody(FIXTURE_CONFERENCE);

		expect(html).toContain('September 2026');
	});
});
