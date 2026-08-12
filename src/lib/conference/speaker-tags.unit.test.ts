import { describe, expect, it } from 'vitest';
import { parseSpeakerTags, serializeSpeakerTags, tagsFromFormInput } from './speaker-tags';

describe('speaker tags', () => {
	it('parses a JSON array and drops blanks/dupes (case-insensitive)', () => {
		expect(parseSpeakerTags('["VIP","vip"," keynote ",""]')).toEqual(['VIP', 'keynote']);
	});

	it('treats garbage as no tags rather than throwing', () => {
		expect(parseSpeakerTags('not-json')).toEqual([]);
		expect(parseSpeakerTags(null)).toEqual([]);
	});

	it('serializes empty to null so storage has one “no tags” state', () => {
		expect(serializeSpeakerTags([])).toBeNull();
		expect(serializeSpeakerTags(['vip'])).toBe('["vip"]');
	});

	it('accepts comma- or newline-separated form input', () => {
		expect(tagsFromFormInput('vip, keynote\nalumni')).toEqual(['vip', 'keynote', 'alumni']);
	});
});
