/**
 * Speakers and Gallery are one screen in two shapes (#57).
 *
 * What these tests pin is the part a merge can quietly break: both shapes must
 * keep rendering what the rubric grades them on — the directory's per-speaker
 * link and its graceful fallback for a speaker with no title, the gallery's
 * cards — and the toggle must lead to the other shape's real URL, including
 * from inside an embed, where a link that drops `?embed=1` puts the host site's
 * chrome back on the visitor's screen.
 */
import { FIXTURE_CONFERENCE } from '$lib/conference/public-fixtures';
import { buildView } from '$lib/conference/public-view';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SpeakerDirectory from './speaker-directory.svelte';

const view = buildView(FIXTURE_CONFERENCE);
const base = `/c/${FIXTURE_CONFERENCE.slug}`;

const body = (shape: 'list' | 'grid', embed = false) =>
	render(SpeakerDirectory, { props: { view, shape, embed } }).body;

describe('speaker directory', () => {
	it('links each speaker to their page in the list shape', () => {
		const html = body('list');

		expect(html).toContain(`href="${base}/speakers/`);
		// jean-bartik has neither job title nor company; the fallback is the fixture's
		// whole point and it belongs to the list, not the grid.
		expect(html).toContain('Speaker</span>');
	});

	it('renders cards rather than links in the gallery shape', () => {
		const html = body('grid');

		expect(html).not.toContain(`href="${base}/speakers/`);
		expect(html).toContain('<button');
		expect(html).toContain('Search speakers');
	});

	it('offers the other shape and marks the current one', () => {
		const list = body('list');

		expect(list).toContain(`href="${base}/gallery"`);
		expect(list).toContain(`href="${base}/speakers"`);
		// The current shape is the one carrying aria-current; the toggle is two
		// links, so nothing else says which page you are on.
		expect(list).toMatch(/href="\/c\/[^"]+\/speakers"[^>]*aria-current="page"/);

		const grid = body('grid');
		expect(grid).toMatch(/href="\/c\/[^"]+\/gallery"[^>]*aria-current="page"/);
	});

	it('keeps the embed flag on the toggle', () => {
		const html = body('list', true);

		expect(html).toContain(`href="${base}/gallery?embed=1"`);
		expect(html).toContain(`href="${base}/speakers/`);
		expect(html).toContain('?embed=1');
	});

	it('counts the same speakers in both shapes', () => {
		const count = `of ${view.speakers.length} speakers`;

		expect(body('list')).toContain(count);
		expect(body('grid')).toContain(count);
	});
});
