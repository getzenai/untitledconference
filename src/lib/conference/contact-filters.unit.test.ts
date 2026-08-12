import { describe, expect, it } from 'vitest';
import { contactFiltersHref } from './contact-filters';

describe('contactFiltersHref', () => {
	it('builds a query string from filter fields', () => {
		expect(contactFiltersHref({ tag: 'AI' })).toBe('/contacts?tag=AI');
		expect(contactFiltersHref({ company: 'Acme', jobTitle: 'CTO' })).toBe(
			'/contacts?company=Acme&jobTitle=CTO'
		);
		expect(contactFiltersHref({})).toBe('/contacts');
	});
});
