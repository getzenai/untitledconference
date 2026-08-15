import { describe, expect, it } from 'vitest';
import { filePreviewKind, filenameFrom, isSafeFileUrl } from './file-preview';

describe('filePreviewKind', () => {
	it('opens a PDF from the name or the type', () => {
		expect(filePreviewKind('slides.pdf')).toBe('pdf');
		expect(filePreviewKind('https://files.test/deck.PDF')).toBe('pdf');
		expect(filePreviewKind('unnamed', 'application/pdf')).toBe('pdf');
	});

	it('opens ordinary images, not SVG', () => {
		expect(filePreviewKind('headshot.jpg')).toBe('image');
		expect(filePreviewKind('shot.PNG')).toBe('image');
		expect(filePreviewKind('pic', 'image/webp')).toBe('image');
		expect(filePreviewKind('icon.svg')).toBeNull();
		expect(filePreviewKind('icon', 'image/svg+xml')).toBeNull();
	});

	it('leaves unknown types as a download', () => {
		expect(filePreviewKind('notes.docx')).toBeNull();
		expect(filePreviewKind('talk.pptx')).toBeNull();
		expect(filePreviewKind('https://files.test/notes.docx')).toBeNull();
	});
});

describe('filenameFrom', () => {
	it('takes the last path segment of a URL', () => {
		expect(filenameFrom('https://files.test/cfp/Final%20slides.pdf?dl=1')).toBe('Final slides.pdf');
	});

	it('keeps a bare name', () => {
		expect(filenameFrom('slides.pdf')).toBe('slides.pdf');
	});
});

describe('isSafeFileUrl', () => {
	it('accepts http(s) and rejects the rest', () => {
		expect(isSafeFileUrl('https://files.test/slides.pdf')).toBe(true);
		expect(isSafeFileUrl('http://localhost/slides.pdf')).toBe(true);
		expect(isSafeFileUrl('javascript:alert(1)')).toBe(false);
		expect(isSafeFileUrl('slides.pdf')).toBe(false);
	});
});
