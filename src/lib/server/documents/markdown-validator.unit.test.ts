/**
 * Markdown Validator Unit Tests
 *
 * Replaces the TipTap JSON validator: AI generated content is now markdown and
 * only counts as valid if the Milkdown editor can round-trip it.
 */

import { describe, expect, it } from 'vitest';
import { validateMarkdownContent } from './markdown-validator';
import { MAX_CONTENT_NESTING_DEPTH, VALIDATION_ERRORS } from './validation-constants';

describe('validateMarkdownContent', () => {
	it('accepts commonmark constructs', () => {
		const markdown = [
			'# Heading',
			'',
			'Paragraph with **bold**, *italic*, `code` and a [link](https://example.com).',
			'',
			'- bullet',
			'- bullet',
			'',
			'1. ordered',
			'',
			'> quoted',
			'',
			'```ts',
			'const a = 1;',
			'```',
			'',
			'---'
		].join('\n');

		const result = validateMarkdownContent(markdown);

		expect(result.isValid).toBe(true);
		expect(result.markdown).toBe(markdown);
	});

	it('accepts gfm constructs', () => {
		const result = validateMarkdownContent(
			['~~struck~~', '', '| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n')
		);

		expect(result.isValid).toBe(true);
	});

	it('accepts images', () => {
		expect(validateMarkdownContent('![alt](https://example.com/a.png)').isValid).toBe(true);
	});

	it('trims surrounding whitespace from valid markdown', () => {
		const result = validateMarkdownContent('\n\n  # Heading\n\n');

		expect(result.isValid).toBe(true);
		expect(result.markdown).toBe('# Heading');
	});

	it('rejects non-string content', () => {
		for (const value of [null, undefined, 42, { type: 'doc' }, [{ type: 'paragraph' }]]) {
			const result = validateMarkdownContent(value);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Content must be a markdown string');
		}
	});

	it('names the received type in the details', () => {
		expect(validateMarkdownContent([]).details).toBe('Received type: array');
		expect(validateMarkdownContent({}).details).toBe('Received type: object');
	});

	it('rejects empty and whitespace-only content', () => {
		const result = validateMarkdownContent('   \n  ');

		expect(result.isValid).toBe(false);
		expect(result.details).toBe('Received an empty string');
	});

	it('rejects raw HTML with an actionable message', () => {
		const result = validateMarkdownContent('<div>hello</div>');

		expect(result.isValid).toBe(false);
		expect(result.error).toBe('Invalid markdown content');
		expect(result.details).toContain('Raw HTML is not supported');
	});

	it('rejects content nested deeper than the limit', () => {
		// Each level adds a blockquote wrapper, which is two mdast levels deep
		const markdown = `${'> '.repeat(MAX_CONTENT_NESTING_DEPTH)}too deep`;

		const result = validateMarkdownContent(markdown);

		expect(result.isValid).toBe(false);
		expect(result.details).toBe(VALIDATION_ERRORS.CONTENT_TOO_DEEP);
	});
});
