/**
 * The speaker's links end up as `href`s on a page anyone can visit, which makes
 * this module's job narrower than "validate a URL": it decides what the public
 * site is willing to execute on a click.
 */
import { describe, expect, it } from 'vitest';
import {
	collectSpeakerLinks,
	isPublishableUrl,
	parseSpeakerLinks,
	serializeSpeakerLinks
} from './speaker-links';

describe('what may be published as a link', () => {
	it('accepts ordinary web addresses', () => {
		expect(isPublishableUrl('https://example.com/talks')).toBe(true);
		expect(isPublishableUrl('http://example.com')).toBe(true);
	});

	it('refuses schemes a browser would execute or read from disk', () => {
		// The whole reason this function exists. `javascript:` in an href on the
		// public speaker page is stored XSS against every visitor, and the bio
		// next to it is safe only because it is rendered as text.
		expect(isPublishableUrl('javascript:alert(1)')).toBe(false);
		expect(isPublishableUrl('JavaScript:alert(1)')).toBe(false);
		expect(isPublishableUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
		expect(isPublishableUrl('file:///etc/passwd')).toBe(false);
	});

	it('refuses anything that is not a URL at all', () => {
		expect(isPublishableUrl('example.com')).toBe(false);
		expect(isPublishableUrl('')).toBe(false);
	});
});

describe('collecting what the form posted', () => {
	it('skips empty rows, because the form always draws more than most people use', () => {
		const result = collectSpeakerLinks([
			{ label: 'Site', url: 'https://example.com' },
			{ label: '', url: '' },
			{ label: 'ignored', url: '   ' }
		]);

		expect(result).toEqual({ ok: true, links: [{ label: 'Site', url: 'https://example.com' }] });
	});

	it('names the row that cannot be published, not just that something failed', () => {
		const result = collectSpeakerLinks([
			{ label: 'Fine', url: 'https://example.com' },
			{ label: 'Bad', url: 'javascript:alert(1)' }
		]);

		expect(result).toEqual({ ok: false, index: 1 });
	});

	it('labels a bare URL with its host, so a blank label is not a blank link', () => {
		const result = collectSpeakerLinks([{ label: '', url: 'https://www.linkedin.com/in/someone' }]);

		expect(result).toEqual({
			ok: true,
			links: [{ label: 'linkedin.com', url: 'https://www.linkedin.com/in/someone' }]
		});
	});
});

describe('the stored column', () => {
	it('round-trips', () => {
		const links = [{ label: 'Site', url: 'https://example.com' }];

		expect(parseSpeakerLinks(serializeSpeakerLinks(links))).toEqual(links);
	});

	it('stores no links as null, so "unset" has one representation', () => {
		expect(serializeSpeakerLinks([])).toBeNull();
		expect(parseSpeakerLinks(null)).toEqual([]);
	});

	it('reads garbage as no links rather than throwing', () => {
		// A profile page that 500s because of one bad column is worse than a
		// profile page that shows no links: the speaker cannot fix it either way.
		expect(parseSpeakerLinks('not json')).toEqual([]);
		expect(parseSpeakerLinks('{"not":"an array"}')).toEqual([]);
		expect(parseSpeakerLinks('[{"label":"no url"}]')).toEqual([]);
		expect(parseSpeakerLinks('[null, 3, "x"]')).toEqual([]);
	});
});
