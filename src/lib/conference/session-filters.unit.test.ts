/**
 * The two directions have to agree: what the URL says, and what a change to it
 * writes back. A round trip that loses a facet is the bug this file exists to
 * stop, because it looks exactly like "the filter did not apply".
 */
import { describe, expect, it } from 'vitest';
import {
	hasSessionFilters,
	readSessionFilters,
	sessionFiltersHref,
	toggleFacetValue
} from './session-filters';

const at = (search: string) => new URL(`https://example.com/c/devflow${search}`);

describe('readSessionFilters', () => {
	it('reads a search and repeated facets', () => {
		expect(
			readSessionFilters(at('?q=injection&track=platform&track=craft&room=main').searchParams)
		).toEqual({ q: 'injection', tracks: ['platform', 'craft'], formats: [], rooms: ['main'] });
	});

	it('treats a missing and an empty parameter the same', () => {
		expect(readSessionFilters(at('').searchParams)).toEqual({
			q: '',
			tracks: [],
			formats: [],
			rooms: []
		});
		expect(readSessionFilters(at('?q=&track=').searchParams)).toEqual({
			q: '',
			tracks: [],
			formats: [],
			rooms: []
		});
	});

	it('trims a search that is only spaces', () => {
		expect(readSessionFilters(at('?q=%20%20').searchParams).q).toBe('');
	});
});

describe('sessionFiltersHref', () => {
	it('writes the search and every facet value', () => {
		expect(
			sessionFiltersHref(at(''), {
				q: 'injection',
				tracks: ['platform', 'craft'],
				formats: [],
				rooms: ['main']
			})
		).toBe('/c/devflow?q=injection&track=platform&track=craft&room=main');
	});

	it('leaves no empty parameter behind when a filter is cleared', () => {
		const filtered = at('?q=injection&track=platform');
		expect(sessionFiltersHref(filtered, { q: '', tracks: [], formats: [], rooms: [] })).toBe(
			'/c/devflow'
		);
	});

	it('keeps the hash and parameters it does not own', () => {
		expect(
			sessionFiltersHref(at('?embed=1#session-filters'), {
				q: 'injection',
				tracks: [],
				formats: [],
				rooms: []
			})
		).toBe('/c/devflow?embed=1&q=injection#session-filters');
	});

	it('round-trips through read without losing a facet', () => {
		const filters = {
			q: 'prompt injection',
			tracks: ['platform'],
			formats: ['talk', 'workshop'],
			rooms: []
		};
		const href = sessionFiltersHref(at(''), filters);
		expect(readSessionFilters(new URL(href, 'https://example.com').searchParams)).toEqual(filters);
	});
});

describe('hasSessionFilters', () => {
	it('is false only when nothing narrows the list', () => {
		expect(hasSessionFilters({ q: '', tracks: [], formats: [], rooms: [] })).toBe(false);
		expect(hasSessionFilters({ q: '   ', tracks: [], formats: [], rooms: [] })).toBe(false);
		expect(hasSessionFilters({ q: 'x', tracks: [], formats: [], rooms: [] })).toBe(true);
		expect(hasSessionFilters({ q: '', tracks: ['platform'], formats: [], rooms: [] })).toBe(true);
	});
});

describe('toggleFacetValue', () => {
	it('adds, removes, and keeps the order stable', () => {
		expect(toggleFacetValue([], 'platform')).toEqual(['platform']);
		expect(toggleFacetValue(['platform'], 'craft')).toEqual(['platform', 'craft']);
		expect(toggleFacetValue(['platform', 'craft'], 'platform')).toEqual(['craft']);
	});
});
