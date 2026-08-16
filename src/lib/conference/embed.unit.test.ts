import { describe, expect, it } from 'vitest';

import {
	EMBEDDABLE_SURFACES,
	embedSnippet,
	embedUrl,
	isEmbeddableSurface,
	surfaceUrl,
	withEmbed
} from './embed';

const ORIGIN = 'https://conf.example.com';

describe('surface list', () => {
	it('carries the five public widgets, index first', () => {
		expect(EMBEDDABLE_SURFACES.map((s) => s.path)).toEqual([
			'',
			'/agenda',
			'/itinerary',
			'/speakers',
			'/gallery'
		]);
	});
});

describe('urls and snippets', () => {
	it('builds the plain public address of a surface', () => {
		expect(surfaceUrl(ORIGIN, 'devflow-conf-2027', '/agenda')).toBe(
			'https://conf.example.com/c/devflow-conf-2027/agenda'
		);
		expect(surfaceUrl(ORIGIN, 'devflow-conf-2027', '')).toBe(
			'https://conf.example.com/c/devflow-conf-2027'
		);
	});

	it('marks the embed address so the chrome comes off', () => {
		expect(embedUrl(ORIGIN, 'devflow-conf-2027', '/gallery')).toBe(
			'https://conf.example.com/c/devflow-conf-2027/gallery?embed=1'
		);
	});

	it('emits a snippet that points at the embed address and names the frame', () => {
		const speakers = EMBEDDABLE_SURFACES.find((s) => s.path === '/speakers')!;
		const snippet = embedSnippet(ORIGIN, 'devflow-conf-2027', speakers);

		expect(snippet).toContain(`src="${embedUrl(ORIGIN, 'devflow-conf-2027', '/speakers')}"`);
		expect(snippet).toContain('title="Speakers"');
		expect(snippet).toContain(`height="${speakers.height}"`);
		expect(snippet.startsWith('<iframe')).toBe(true);
		expect(snippet.trimEnd().endsWith('</iframe>')).toBe(true);
	});

	// The snippet is HTML we hand somebody to paste into a page we do not
	// control, so Svelte's escaping never sees it — the browser parses it on
	// their site, not ours. Slug and origin are the values that come from
	// outside, and neither may close the attribute.
	it('cannot be escaped out of by a hostile slug or origin', () => {
		const surface = EMBEDDABLE_SURFACES[0];
		const snippet = embedSnippet(ORIGIN, '"><script>alert(1)</script>', surface);

		expect(snippet).not.toContain('<script>');
		expect(snippet).toContain('&quot;&gt;&lt;script&gt;');

		const fromOrigin = embedSnippet('https://evil"onload="x', 'devflow-conf-2027', surface);
		expect(fromOrigin).not.toContain('onload="x');
	});

	it('leaves a link alone outside an embed', () => {
		expect(withEmbed('/c/x/speakers/7', false)).toBe('/c/x/speakers/7');
		expect(withEmbed('/c/x/speakers/7', true)).toBe('/c/x/speakers/7?embed=1');
	});

	it('keeps an existing query and adds embed beside it', () => {
		expect(withEmbed('/c/x/agenda?session=ses-04', false)).toBe('/c/x/agenda?session=ses-04');
		expect(withEmbed('/c/x/agenda?session=ses-04', true)).toBe(
			'/c/x/agenda?session=ses-04&embed=1'
		);
	});
});

describe('isEmbeddableSurface', () => {
	it('allows every listed surface and the speaker detail behind the directory', () => {
		for (const surface of EMBEDDABLE_SURFACES) {
			expect(isEmbeddableSurface(`/c/devflow-conf-2027${surface.path}`)).toBe(true);
		}
		expect(isEmbeddableSurface('/c/devflow-conf-2027/speakers/spk-1')).toBe(true);
	});

	it('ignores a trailing slash', () => {
		expect(isEmbeddableSurface('/c/devflow-conf-2027/')).toBe(true);
		expect(isEmbeddableSurface('/c/devflow-conf-2027/agenda/')).toBe(true);
	});

	// The whole point of an allowlist: a new page under /c is not framable because
	// it appeared, only because it was added here on purpose.
	it('refuses an unlisted page under the same conference', () => {
		expect(isEmbeddableSurface('/c/devflow-conf-2027/cfp')).toBe(false);
		expect(isEmbeddableSurface('/c/devflow-conf-2027/agenda/edit')).toBe(false);
		expect(isEmbeddableSurface('/c/devflow-conf-2027/speakers/spk-1/edit')).toBe(false);
	});

	it('refuses everything outside the public conference tree', () => {
		expect(isEmbeddableSurface('/')).toBe(false);
		expect(isEmbeddableSurface('/login')).toBe(false);
		expect(isEmbeddableSurface('/manage/devflow-conf-2027/embed')).toBe(false);
		expect(isEmbeddableSurface('/c')).toBe(false);
		expect(isEmbeddableSurface('/c/')).toBe(false);
	});
});
