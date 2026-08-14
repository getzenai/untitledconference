import { describe, expect, it } from 'vitest';
import { errorDetail, errorHeadline } from './error-copy';

describe('errorHeadline', () => {
	it('names the two cases a visitor can act on', () => {
		expect(errorHeadline(404)).toBe('That page is not here');
		expect(errorHeadline(403)).toBe('Not yours to open');
	});

	it('falls back for everything else rather than inventing a case', () => {
		expect(errorHeadline(400)).toBe('Something broke');
		expect(errorHeadline(500)).toBe('Something broke');
		expect(errorHeadline(503)).toBe('Something broke');
	});
});

describe('errorDetail', () => {
	it('passes a 4xx message through — the throw says it better', () => {
		expect(errorDetail(404, 'No conference with that address')).toBe(
			'No conference with that address'
		);
		expect(errorDetail(403, 'Conference not found')).toBe('Conference not found');
	});

	it('says something rather than nothing when the throw carried no message', () => {
		expect(errorDetail(404, undefined)).toBe('No further detail came with this error.');
		expect(errorDetail(404, '')).toBe('No further detail came with this error.');
		expect(errorDetail(404, '   ')).toBe('No further detail came with this error.');
	});

	it('never shows a 5xx message, however it was thrown', () => {
		// The two shapes a 5xx message takes: SvelteKit's own substitution for an
		// uncaught throw, and a deliberate one written for an operator.
		for (const [status, message] of [
			[500, 'Internal Error'],
			[500, 'Failed query: select "slug" from "conference" where …'],
			[503, 'Postgres is down, paging the on-call'],
			[502, 'upstream 10.0.0.4:5432 refused the connection']
		] as const) {
			const shown = errorDetail(status, message);
			expect(shown).not.toContain(message);
			expect(shown).toBe(
				'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
			);
		}
	});
});
