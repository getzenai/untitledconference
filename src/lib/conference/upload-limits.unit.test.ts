import { describe, expect, it } from 'vitest';
import { headshotContentType, MAX_UPLOAD_BYTES, rejectUpload } from './upload-limits';

describe('headshotContentType', () => {
	it('keeps a type the browser already named', () => {
		expect(headshotContentType({ name: 'shot.bin', type: 'image/png' })).toBe('image/png');
		expect(headshotContentType({ name: 'shot.bin', type: 'image/jpeg' })).toBe('image/jpeg');
		expect(headshotContentType({ name: 'shot.bin', type: 'image/webp' })).toBe('image/webp');
	});

	it('reads the extension when the OS sent no UTI', () => {
		expect(headshotContentType({ name: 'PHOTO.PNG', type: 'application/octet-stream' })).toBe(
			'image/png'
		);
		expect(headshotContentType({ name: 'face.JPEG', type: '' })).toBe('image/jpeg');
		expect(headshotContentType({ name: 'pic.webp', type: '' })).toBe('image/webp');
		expect(headshotContentType({ name: 'me.jpg', type: 'application/octet-stream' })).toBe(
			'image/jpeg'
		);
	});

	it('does not let a friendly name override a type we will not store', () => {
		expect(headshotContentType({ name: 'face.png', type: 'image/heic' })).toBeNull();
		expect(headshotContentType({ name: 'face.png', type: 'application/pdf' })).toBeNull();
		expect(headshotContentType({ name: 'face.heic', type: '' })).toBeNull();
		expect(headshotContentType({ name: 'face.gif', type: 'application/octet-stream' })).toBeNull();
	});
});

describe('rejectUpload', () => {
	it('still refuses empty, huge, and unknown types', () => {
		expect(rejectUpload({ size: 0, type: 'image/png' })).toBe('empty');
		expect(rejectUpload({ size: MAX_UPLOAD_BYTES + 1, type: 'image/png' })).toBe('too_large');
		expect(rejectUpload({ size: 10, type: 'image/svg+xml' })).toBe('unsupported_type');
		expect(rejectUpload({ size: 10, type: 'image/png' })).toBeNull();
	});
});
