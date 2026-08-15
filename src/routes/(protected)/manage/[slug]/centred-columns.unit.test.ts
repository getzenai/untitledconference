/**
 * #424: the four narrow organizer pages centre their column.
 *
 * Fabian, 14.08.: *"rounds und scorecards, reviewer pool, embed & share, settings
 * ist links orientiert mit viel whitespace. da wäre zentriert besser."* Each of
 * these pages bounded its content and never centred it, so on a wide screen the
 * whole product sat in the left half of the window.
 *
 * The test is here rather than in each page's own file because the rule is one
 * rule across four pages, and because the way it broke was per-section widths:
 * every card carrying its own `max-w-2xl` looks bounded and centres nothing. So
 * the check is not "the page mentions mx-auto somewhere" but "every bound on
 * this page is centred" — a section that re-bounds the column on its own is the
 * defect, and it fails here.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import EmbedPage from './embed/+page.svelte';
import PeoplePage from './people/+page.svelte';
import RoundsPage from './rounds/+page.svelte';
import SettingsPage from './settings/+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	listedPublicly: true,
	slotCapacity: null,
	predecessorConferenceId: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const shell = {
	user: { id: 'organizer-1', name: 'Jordan' },
	speakerProfile: false,
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined },
	conference
};

const draw = (page: unknown, data: Record<string, unknown>) =>
	render(page as never, {
		props: { data: { ...shell, ...data }, form: null } as never
	}).body;

/** Every `class="…"` on the page, in document order. */
const classAttributes = (body: string) =>
	[...body.matchAll(/class="([^"]*)"/g)].map((match) => match[1]);

/**
 * A bound the reader sees as the page's column. `max-w-xs` on a search box or
 * `max-w-prose` on a paragraph is a sub-element and not what this is about.
 */
const COLUMN_BOUND = /\bmax-w-(?:2xl|3xl)\b/;

describe('the narrow organizer pages centre their column (#424)', () => {
	const pages = [
		{
			name: 'Rounds & scorecards',
			body: () => draw(RoundsPage, { rounds: [], criteriaByRound: {} })
		},
		{
			name: 'Reviewer pool',
			body: () => draw(PeoplePage, { committee: [], tracks: [], pendingInvitations: [] })
		},
		{ name: 'Embed & share', body: () => draw(EmbedPage, { origin: 'https://example.test' }) }
	];

	for (const page of pages) {
		it(`${page.name}: every column bound is centred`, () => {
			const uncentred = classAttributes(page.body()).filter(
				(classes) => COLUMN_BOUND.test(classes) && !classes.includes('mx-auto')
			);

			expect(uncentred).toEqual([]);
		});

		it(`${page.name}: the column is still bounded`, () => {
			expect(classAttributes(page.body()).some((classes) => COLUMN_BOUND.test(classes))).toBe(true);
		});
	}

	/**
	 * Settings is the exception, and on purpose. Its two columns — the sticky jump
	 * nav and the sections — only exist from `lg`, and below that the nav bleeds to
	 * the window edge with `-mx-6`. Centring it at every width would strand that
	 * strip with a seam on either side, so the centring is `lg:` only, and the
	 * container is the width the two columns actually occupy.
	 */
	it('Settings centres both columns together, from lg upwards', () => {
		const body = draw(SettingsPage, {
			config: { rooms: [], tracks: [], formats: [] },
			sponsorTiers: [],
			templates: [],
			pending: {},
			setup: false,
			callOpen: false
		});
		const classes = classAttributes(body);

		expect(classes.some((c) => c.includes('lg:mx-auto') && c.includes('lg:max-w-[61rem]'))).toBe(
			true
		);
		expect(classes.some((c) => c.includes('mx-auto') && c.includes('max-w-[61rem]'))).toBe(true);
	});
});
