import { describe, expect, it } from 'vitest';
import { pageContext, visiblePageTitle } from './page-context';

/** The document reduced to what the helper reads: the first `h1`, if any. */
function doc(headings: string[]): Pick<Document, 'querySelector'> {
	return {
		querySelector: ((selector: string) =>
			selector === 'h1' && headings.length > 0
				? ({ textContent: headings[0] } as Element)
				: null) as Document['querySelector']
	};
}

describe('visiblePageTitle', () => {
	it('reads the first h1', () => {
		expect(visiblePageTitle(doc(['Agenda', 'Later']))).toBe('Agenda');
	});

	it('collapses the whitespace a wrapped heading brings', () => {
		expect(visiblePageTitle(doc(['\n  Review\n  queue\n']))).toBe('Review queue');
	});

	it('is null without a heading', () => {
		expect(visiblePageTitle(doc([]))).toBeNull();
	});

	it('is null for an empty heading', () => {
		expect(visiblePageTitle(doc(['   ']))).toBeNull();
	});
});

describe('pageContext', () => {
	const base = {
		routeId: '/(protected)/manage/[slug]/agenda',
		url: new URL('https://untitledconference.com/manage/pyconde/agenda'),
		params: { slug: 'pyconde' },
		title: 'Agenda'
	};

	it('carries route, url, title and params', () => {
		expect(pageContext(base)).toEqual({
			routeId: '/(protected)/manage/[slug]/agenda',
			url: 'https://untitledconference.com/manage/pyconde/agenda',
			title: 'Agenda',
			params: { slug: 'pyconde' }
		});
	});

	it('sends nothing when the page has no visible heading', () => {
		expect(pageContext({ ...base, title: null })).toBeUndefined();
	});

	it('sends nothing without a route id', () => {
		expect(pageContext({ ...base, routeId: null })).toBeUndefined();
	});

	it('drops params that did not match, so every value is a string', () => {
		const context = pageContext({
			...base,
			params: { slug: 'pyconde', submissionId: undefined }
		});
		expect(context?.params).toEqual({ slug: 'pyconde' });
	});

	it('carries what the page has selected', () => {
		const context = pageContext({ ...base, focus: { day: '2027-05-04', roundId: 4 } });
		expect(context?.focus).toEqual({ day: '2027-05-04', roundId: '4' });
	});

	it('leaves out a focus field the page has no value for', () => {
		const context = pageContext({ ...base, focus: { day: undefined, roundId: null } });
		expect(context?.focus).toBeUndefined();
		expect(context?.routeId).toBe(base.routeId);
	});

	it('drops one over-long field rather than lose the whole block to it', () => {
		const context = pageContext({
			...base,
			focus: { day: '2027-05-04', notes: 'x'.repeat(400) }
		});
		expect(context?.focus).toEqual({ day: '2027-05-04' });
	});

	it('sends no focus at all when the page offers none', () => {
		expect(pageContext(base)).not.toHaveProperty('focus');
	});

	it('keeps the query, so a filtered list is described as filtered', () => {
		const context = pageContext({
			...base,
			url: new URL('https://untitledconference.com/manage/pyconde/talks?status=accepted')
		});
		expect(context?.url).toBe(
			'https://untitledconference.com/manage/pyconde/talks?status=accepted'
		);
	});
});
