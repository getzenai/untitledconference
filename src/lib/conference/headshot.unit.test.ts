import { describe, expect, it } from 'vitest';
import { isUploadedHeadshot } from './headshot';

describe('isUploadedHeadshot', () => {
	it('is only the photo a speaker uploaded, not a seed stand-in', () => {
		expect(isUploadedHeadshot('/speaker-photo/7?v=1')).toBe(true);
		expect(isUploadedHeadshot('/speakers/lovelace.svg')).toBe(false);
		expect(isUploadedHeadshot(null)).toBe(false);
		expect(isUploadedHeadshot('')).toBe(false);
	});
});
