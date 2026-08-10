import { describe, expect, it } from 'vitest';
import { proseBlocks } from './prose';

describe('organizer prose', () => {
	it('has nothing to render for empty or unset text', () => {
		// The page tests `.length`, so "no description at all" and "a box someone
		// emptied and saved" have to arrive here as the same answer.
		expect(proseBlocks(null)).toEqual([]);
		expect(proseBlocks(undefined)).toEqual([]);
		expect(proseBlocks('')).toEqual([]);
		expect(proseBlocks('   \n\n  \n')).toEqual([]);
	});

	it('joins wrapped lines into one paragraph and splits on a blank line', () => {
		expect(
			proseBlocks('We want talks\nthat show the work.\n\nFirst-time speakers welcome.')
		).toEqual([
			{ kind: 'paragraph', text: 'We want talks that show the work.' },
			{ kind: 'paragraph', text: 'First-time speakers welcome.' }
		]);
	});

	it('collects consecutive bullets into one list', () => {
		expect(proseBlocks('- Reviews are anonymous.\n· Travel is covered.\n* You can edit.')).toEqual([
			{
				kind: 'list',
				items: ['Reviews are anonymous.', 'Travel is covered.', 'You can edit.']
			}
		]);
	});

	it('lets a bullet end a paragraph without a blank line between them', () => {
		// A lead-in sentence followed straight by its list is how people type; if
		// that needed a blank line the box would silently swallow the bullets into
		// the paragraph.
		expect(proseBlocks('Good to know:\n- Reviews are anonymous.\nAnd one more thing.')).toEqual([
			{ kind: 'paragraph', text: 'Good to know:' },
			{ kind: 'list', items: ['Reviews are anonymous.'] },
			{ kind: 'paragraph', text: 'And one more thing.' }
		]);
	});

	it('leaves markup and markdown literal', () => {
		// The whole reason this is not a markdown renderer: whatever an organizer
		// types comes back as text, and the page renders these strings as text
		// nodes, so no input can become markup on a public page.
		expect(proseBlocks('<script>alert(1)</script> **bold** [x](y)')).toEqual([
			{ kind: 'paragraph', text: '<script>alert(1)</script> **bold** [x](y)' }
		]);
	});

	it('reads CRLF the same as LF', () => {
		expect(proseBlocks('One.\r\n\r\n- Two.')).toEqual([
			{ kind: 'paragraph', text: 'One.' },
			{ kind: 'list', items: ['Two.'] }
		]);
	});

	it('does not turn a hyphenated word into a bullet', () => {
		// The marker is a hyphen followed by a space at the start of a line. A line
		// that merely begins with "-well" is prose.
		expect(proseBlocks('-well, almost')).toEqual([{ kind: 'paragraph', text: '-well, almost' }]);
	});
});
