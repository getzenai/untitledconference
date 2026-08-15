import { describe, expect, it } from 'vitest';
import { parseDeclineNote, parseGuidance, sentenceForDecision } from './decision-note';

const form = (entries: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(entries)) data.set(key, value);
	return data;
};

describe('parseGuidance', () => {
	it('keeps the sentence the committee said', () => {
		expect(parseGuidance(form({ guidance: '  resubmit with your client  ' }))).toEqual({
			ok: true,
			text: 'resubmit with your client'
		});
	});

	it('refuses an empty box — that would be a decline under another name', () => {
		expect(parseGuidance(form({ guidance: '   ' })).ok).toBe(false);
	});
});

describe('parseDeclineNote', () => {
	it('treats empty as a clean decline', () => {
		expect(parseDeclineNote(form({}))).toBeNull();
		expect(parseDeclineNote(form({ declineNote: '  ' }))).toBeNull();
	});

	it('keeps the champion sentence', () => {
		expect(parseDeclineNote(form({ declineNote: 'closest we had' }))).toBe('closest we had');
	});
});

describe('sentenceForDecision', () => {
	it('requires guidance only on resubmit', () => {
		expect(sentenceForDecision(form({}), 'resubmit_with_guidance').ok).toBe(false);
		expect(
			sentenceForDecision(form({ guidance: 'try with the client' }), 'resubmit_with_guidance')
		).toEqual({
			ok: true,
			sentence: 'try with the client'
		});
	});

	it('drops leftover fields on the other buttons', () => {
		const leftover = form({
			guidance: 'try with the client',
			declineNote: 'closest we had'
		});
		expect(sentenceForDecision(leftover, 'accepted')).toEqual({ ok: true, sentence: null });
		expect(sentenceForDecision(leftover, 'waitlisted')).toEqual({ ok: true, sentence: null });
		expect(sentenceForDecision(leftover, 'rejected')).toEqual({
			ok: true,
			sentence: 'closest we had'
		});
	});
});
