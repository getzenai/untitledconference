import { describe, expect, it } from 'vitest';
import { answerParts } from './answer-links';

describe('answerParts', () => {
	it('makes an answer that is nothing but a link one link', () => {
		expect(answerParts('https://example.com/talk')).toEqual([
			{ kind: 'link', value: 'https://example.com/talk' }
		]);
	});

	it('leaves an answer without a link alone, in one piece', () => {
		expect(answerParts('I have never recorded a talk.')).toEqual([
			{ kind: 'text', value: 'I have never recorded a talk.' }
		]);
	});

	it('never hands back nothing, so no caller has to check', () => {
		expect(answerParts('')).toEqual([{ kind: 'text', value: '' }]);
	});

	it('keeps the prose around a link, in the order it was written', () => {
		expect(answerParts('Slides at https://example.com/deck, video later.')).toEqual([
			{ kind: 'text', value: 'Slides at ' },
			{ kind: 'link', value: 'https://example.com/deck' },
			{ kind: 'text', value: ', video later.' }
		]);
	});

	it('finds every link, not just the first', () => {
		expect(answerParts('https://a.example/1\nhttps://b.example/2')).toEqual([
			{ kind: 'link', value: 'https://a.example/1' },
			{ kind: 'text', value: '\n' },
			{ kind: 'link', value: 'https://b.example/2' }
		]);
	});

	it('gives the full stop back to the sentence', () => {
		expect(answerParts('See https://example.com/deck.')).toEqual([
			{ kind: 'text', value: 'See ' },
			{ kind: 'link', value: 'https://example.com/deck' },
			{ kind: 'text', value: '.' }
		]);
	});

	it('gives back a bracket the URL never opened', () => {
		expect(answerParts('(see https://example.com/deck)')).toEqual([
			{ kind: 'text', value: '(see ' },
			{ kind: 'link', value: 'https://example.com/deck' },
			{ kind: 'text', value: ')' }
		]);
	});

	it('keeps a bracket the URL opened itself', () => {
		expect(answerParts('https://example.com/wiki/Rust_(language)')).toEqual([
			{ kind: 'link', value: 'https://example.com/wiki/Rust_(language)' }
		]);
	});

	it('keeps a query string, which is full of the punctuation a sentence uses', () => {
		expect(answerParts('https://example.com/v?t=90&list=a,b')).toEqual([
			{ kind: 'link', value: 'https://example.com/v?t=90&list=a,b' }
		]);
	});

	it('is not fooled by a scheme that is not a link', () => {
		// An anchor is a thing a reviewer clicks, and this answer came from a public
		// form. Only http and https become one.
		expect(answerParts('javascript:alert(1)')).toEqual([
			{ kind: 'text', value: 'javascript:alert(1)' }
		]);
		expect(answerParts('data:text/html,<script>x</script>')).toEqual([
			{ kind: 'text', value: 'data:text/html,<script>x</script>' }
		]);
	});

	it('does not linkify a bare domain — a false anchor is worse than none', () => {
		expect(answerParts('find me at example.com')).toEqual([
			{ kind: 'text', value: 'find me at example.com' }
		]);
	});
});
