import { describe, expect, it } from 'vitest';
import { inlineNodes, proseBlocks } from './prose';

const text = (value: string) => ({ kind: 'text', text: value });
const paragraph = (value: string) => ({ kind: 'paragraph', content: [text(value)] });

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
			paragraph('We want talks that show the work.'),
			paragraph('First-time speakers welcome.')
		]);
	});

	it('collects consecutive bullets into one list', () => {
		expect(proseBlocks('- Reviews are anonymous.\n· Travel is covered.\n* You can edit.')).toEqual([
			{
				kind: 'list',
				ordered: false,
				items: [
					[text('Reviews are anonymous.')],
					[text('Travel is covered.')],
					[text('You can edit.')]
				]
			}
		]);
	});

	it('keeps a numbered list separate from a bulleted one', () => {
		// A call that lists its formats "1. 2. 3." means the numbers; a change of
		// marker starts a new list rather than silently renumbering the rest.
		expect(proseBlocks('1. Write it.\n2) Send it.\n- Then wait.')).toEqual([
			{ kind: 'list', ordered: true, items: [[text('Write it.')], [text('Send it.')]] },
			{ kind: 'list', ordered: false, items: [[text('Then wait.')]] }
		]);
	});

	it('lets a bullet end a paragraph without a blank line between them', () => {
		// A lead-in sentence followed straight by its list is how people type; if
		// that needed a blank line the box would silently swallow the bullets into
		// the paragraph.
		expect(proseBlocks('Good to know:\n- Reviews are anonymous.\nAnd one more thing.')).toEqual([
			paragraph('Good to know:'),
			{ kind: 'list', ordered: false, items: [[text('Reviews are anonymous.')]] },
			paragraph('And one more thing.')
		]);
	});

	it('reads headings as page-relative levels and rules as their own block', () => {
		// The call's own title is the page's h2, so the organizer's top heading is
		// an h3 — a long call gets an outline instead of one grey run of text.
		expect(proseBlocks('# Session formats\n\nPick one.\n\n---\n\n### Fine print')).toEqual([
			{ kind: 'heading', level: 3, content: [text('Session formats')] },
			paragraph('Pick one.'),
			{ kind: 'rule' },
			{ kind: 'heading', level: 5, content: [text('Fine print')] }
		]);
	});

	it('does not turn a hyphenated word or a hashtag into markup', () => {
		// The markers need their space: a line that merely begins with "-well" or
		// "#2" is prose.
		expect(proseBlocks('-well, almost')).toEqual([paragraph('-well, almost')]);
		expect(proseBlocks('#2 on the list')).toEqual([paragraph('#2 on the list')]);
	});

	it('reads CRLF the same as LF', () => {
		expect(proseBlocks('One.\r\n\r\n- Two.')).toEqual([
			paragraph('One.'),
			{ kind: 'list', ordered: false, items: [[text('Two.')]] }
		]);
	});
});

describe('inline markup', () => {
	it('reads bold, italic and code', () => {
		expect(inlineNodes('Acceptance is **5–15%**, so _read this_ and run `npm test`.')).toEqual([
			text('Acceptance is '),
			{ kind: 'strong', text: '5–15%' },
			text(', so '),
			{ kind: 'em', text: 'read this' },
			text(' and run '),
			{ kind: 'code', text: 'npm test' },
			text('.')
		]);
	});

	it('leaves markers alone inside code, and inside a word', () => {
		// Backticks are how someone quotes the syntax itself, and snake_case in a
		// sentence is not emphasis.
		expect(inlineNodes('`**not bold**` and some_file_name')).toEqual([
			{ kind: 'code', text: '**not bold**' },
			text(' and some_file_name')
		]);
	});

	it('makes a written link and a bare URL both clickable', () => {
		expect(
			inlineNodes('See [the programme](https://ai.engineer/nyc) or https://example.com.')
		).toEqual([
			text('See '),
			{ kind: 'link', text: 'the programme', href: 'https://ai.engineer/nyc' },
			text(' or '),
			{ kind: 'link', text: 'https://example.com', href: 'https://example.com' },
			text('.')
		]);
	});

	it('accepts mailto and refuses every other scheme', () => {
		// A link's href is the one value from this text that reaches an attribute,
		// so the scheme allowlist is the whole defence. A refused link stays as the
		// characters the organizer typed — visible to them, inert to the reader.
		expect(inlineNodes('[Ask us](mailto:cfp@example.com)')).toEqual([
			{ kind: 'link', text: 'Ask us', href: 'mailto:cfp@example.com' }
		]);
		expect(inlineNodes('[Click](javascript:alert(1))')).toEqual([
			text('[Click](javascript:alert(1))')
		]);
		expect(inlineNodes('[Home](/portal)')).toEqual([text('[Home](/portal)')]);
	});

	it('carries markup as text, never as markup', () => {
		// The parser returns values; the page prints their text. Whatever an
		// organizer types about HTML arrives as characters on a public page.
		expect(proseBlocks('<script>alert(1)</script> is not a talk')).toEqual([
			paragraph('<script>alert(1)</script> is not a talk')
		]);
	});
});
