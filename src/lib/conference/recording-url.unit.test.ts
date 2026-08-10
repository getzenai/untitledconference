import { describe, expect, it } from 'vitest';
import { normalizeRecordingUrl } from './recording-url';

describe('a recording link', () => {
	it('keeps an ordinary video address', () => {
		// Public AI Engineer channel talk (issue #84).
		const url = 'https://www.youtube.com/watch?v=ju73sWVtvU0';
		expect(normalizeRecordingUrl(url)).toEqual({ ok: true, url });
	});

	it('reads an empty field as taking the recording down', () => {
		expect(normalizeRecordingUrl('   ')).toEqual({ ok: true, url: null });
	});

	it('refuses a scheme that would run as code in the browser', () => {
		// The value lands in an href on a public page. This is the test that matters:
		// the string below is a valid URL, so anything short of a scheme allowlist
		// lets it through.
		const result = normalizeRecordingUrl('javascript:alert(1)');
		expect(result.ok).toBe(false);
	});

	it('refuses a half-typed address rather than storing it', () => {
		expect(normalizeRecordingUrl('youtube.com/watch?v=x').ok).toBe(false);
	});
});
