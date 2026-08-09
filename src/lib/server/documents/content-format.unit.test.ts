/**
 * Content Format Unit Tests
 *
 * `documents.content` used to hold ProseMirror (TipTap) JSON and now holds markdown.
 * These tests pin down the single read path that has to serve both.
 */

import { describe, expect, it } from 'vitest';
import { proseMirrorJsonToMarkdown, toMarkdown } from './content-format';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {})
});

describe('proseMirrorJsonToMarkdown', () => {
	it('returns an empty string for anything that is not a ProseMirror document', () => {
		expect(proseMirrorJsonToMarkdown(null)).toBe('');
		expect(proseMirrorJsonToMarkdown(undefined)).toBe('');
		expect(proseMirrorJsonToMarkdown('# not json')).toBe('');
		expect(proseMirrorJsonToMarkdown([{ type: 'paragraph' }])).toBe('');
		expect(proseMirrorJsonToMarkdown({ type: 'paragraph' })).toBe('');
	});

	it('converts headings and paragraphs', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc(
					{ type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
					paragraph(text('Body copy.'))
				)
			)
		).toBe('## Title\n\nBody copy.');
	});

	it('clamps heading levels into the 1-6 range', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc({ type: 'heading', attrs: { level: 42 }, content: [text('Deep')] })
			)
		).toBe('###### Deep');
	});

	it('converts inline marks', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc(
					paragraph(
						text('normal '),
						text('bold', [{ type: 'bold' }]),
						text(' '),
						text('italic', [{ type: 'italic' }]),
						text(' '),
						text('struck', [{ type: 'strike' }]),
						text(' '),
						text('code()', [{ type: 'code' }])
					)
				)
			)
		).toBe('normal **bold** *italic* ~~struck~~ `code()`');
	});

	it('converts links', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc(paragraph(text('Zen', [{ type: 'link', attrs: { href: 'https://example.com' } }])))
			)
		).toBe('[Zen](https://example.com)');
	});

	it('leaves inline code untouched instead of escaping it', () => {
		expect(proseMirrorJsonToMarkdown(doc(paragraph(text('a_b*c', [{ type: 'code' }]))))).toBe(
			'`a_b*c`'
		);
	});

	it('escapes markdown control characters in plain text', () => {
		expect(proseMirrorJsonToMarkdown(doc(paragraph(text('costs *5* [each]'))))).toBe(
			'costs \\*5\\* \\[each\\]'
		);
	});

	it('converts bullet lists including nested items', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc({
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraph(text('first'))] },
						{
							type: 'listItem',
							content: [
								paragraph(text('second')),
								{
									type: 'bulletList',
									content: [{ type: 'listItem', content: [paragraph(text('nested'))] }]
								}
							]
						}
					]
				})
			)
		).toBe('- first\n- second\n\n  - nested');
	});

	it('numbers ordered lists from their start attribute', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc({
					type: 'orderedList',
					attrs: { start: 3 },
					content: [
						{ type: 'listItem', content: [paragraph(text('three'))] },
						{ type: 'listItem', content: [paragraph(text('four'))] }
					]
				})
			)
		).toBe('3. three\n4. four');
	});

	it('converts blockquotes, code blocks and horizontal rules', () => {
		expect(
			proseMirrorJsonToMarkdown(
				doc(
					{ type: 'blockquote', content: [paragraph(text('quoted'))] },
					{
						type: 'codeBlock',
						attrs: { language: 'js' },
						content: [text('const a = 1;')]
					},
					{ type: 'horizontalRule' }
				)
			)
		).toBe('> quoted\n\n```js\nconst a = 1;\n```\n\n---');
	});

	it('converts hard breaks', () => {
		expect(
			proseMirrorJsonToMarkdown(doc(paragraph(text('one'), { type: 'hardBreak' }, text('two'))))
		).toBe('one\\\ntwo');
	});
});

describe('toMarkdown', () => {
	it('returns an empty string for null and undefined', () => {
		expect(toMarkdown(null)).toBe('');
		expect(toMarkdown(undefined)).toBe('');
	});

	it('passes markdown through untouched', () => {
		const markdown = '# Title\n\nSome **bold** text.\n';
		expect(toMarkdown(markdown)).toBe(markdown);
	});

	it('converts a ProseMirror document stored as an object', () => {
		expect(toMarkdown(doc(paragraph(text('legacy'))))).toBe('legacy');
	});

	it('converts a ProseMirror document stored as a JSON string', () => {
		expect(toMarkdown(JSON.stringify(doc(paragraph(text('legacy')))))).toBe('legacy');
	});

	it('keeps markdown that merely starts with a brace', () => {
		expect(toMarkdown('{ not json after all')).toBe('{ not json after all');
	});

	it('keeps JSON strings that are not ProseMirror documents', () => {
		const json = '{"foo":"bar"}';
		expect(toMarkdown(json)).toBe(json);
	});
});
