import { describe, expect, it } from 'vitest';
import { TALK_TITLE_MAX, titleLengthError } from './proposal-limits';

describe('titleLengthError', () => {
	it('passes an ordinary title', () => {
		expect(titleLengthError('Rebuilding the deploy pipeline, twice')).toBeNull();
	});

	it('passes a title exactly at the limit', () => {
		expect(titleLengthError('x'.repeat(TALK_TITLE_MAX))).toBeNull();
	});

	it('rejects the 620-character one that broke the table', () => {
		const error = titleLengthError('x'.repeat(620));

		expect(error).toContain(String(TALK_TITLE_MAX));
		// The sentence says how far over, so the speaker knows what to cut.
		expect(error).toContain('620');
	});

	it('measures the trimmed title, not the whitespace around it', () => {
		expect(titleLengthError(`  ${'x'.repeat(TALK_TITLE_MAX)}  `)).toBeNull();
	});
});
