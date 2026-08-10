/**
 * A slug has to be spelled like a URL segment *and* be a segment the app is not
 * already using.
 *
 * The second half is the one that bit: `/manage/new` creates a conference and
 * `/manage/[slug]` opens one. SvelteKit matches the literal first — the compiled
 * route table lists `\/manage\/new\/?$` above `\/manage\/([^/]+?)\/?$` — so a
 * conference slugged `new` can never be opened; its management page renders the
 * create form forever. "New" is a name someone picks by accident, and the
 * product offers no rename.
 */
import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, hasSlugShape, isReservedSlug, slugify } from './slug';

describe('hasSlugShape', () => {
	it('accepts lowercase words joined by single hyphens', () => {
		expect(hasSlugShape('devflow-conf-2027')).toBe(true);
		expect(hasSlugShape('a')).toBe(true);
		expect(hasSlugShape('2027')).toBe(true);
	});

	it('rejects what will not survive a URL unescaped', () => {
		expect(hasSlugShape('Devflow')).toBe(false);
		expect(hasSlugShape('dev flow')).toBe(false);
		expect(hasSlugShape('dev--flow')).toBe(false);
		expect(hasSlugShape('-devflow')).toBe(false);
		expect(hasSlugShape('devflow-')).toBe(false);
		expect(hasSlugShape('')).toBe(false);
		// The attack the embed snippet escapes against; it must not get this far.
		expect(hasSlugShape('"><script>')).toBe(false);
	});

	it('rejects a slug past the length limit and accepts one exactly on it', () => {
		expect(hasSlugShape('a'.repeat(MAX_SLUG_LENGTH))).toBe(true);
		expect(hasSlugShape('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
	});
});

describe('isReservedSlug', () => {
	it('refuses the slug that a route already answers to', () => {
		expect(isReservedSlug('new')).toBe(true);
	});

	it('leaves near misses alone', () => {
		// A prefix check or a `startsWith` would fail these, and they are perfectly
		// good conference addresses.
		expect(isReservedSlug('news')).toBe(false);
		expect(isReservedSlug('new-york-devs')).toBe(false);
		expect(isReservedSlug('renew')).toBe(false);
		expect(isReservedSlug('new2027')).toBe(false);
	});

	it('says nothing about shape', () => {
		// The two questions are asked separately so their answers can carry
		// different messages: "new" is spelled correctly and still unusable.
		expect(hasSlugShape('new')).toBe(true);
		expect(isReservedSlug('Devflow')).toBe(false);
	});
});

describe('slugify against the reserved set', () => {
	it('turns the name "New" into exactly the slug that is refused', () => {
		// This is the whole reason the reservation exists rather than being a
		// theoretical worry: the accident is one conference name away.
		expect(slugify('New')).toBe('new');
		expect(isReservedSlug(slugify('New'))).toBe(true);
	});
});
