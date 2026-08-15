import { describe, expect, it } from 'vitest';
import { parseAcceptCondition } from './accept-condition';

describe('parseAcceptCondition', () => {
	it('reads empty fields as a clean accept', () => {
		const form = new FormData();
		form.set('condition', '   ');
		form.set('conditionOwnerId', 'none');
		expect(parseAcceptCondition(form)).toEqual({ ok: true, condition: null });
	});

	it('refuses a note without an owner', () => {
		const form = new FormData();
		form.set('condition', 'bring a co-presenter');
		expect(parseAcceptCondition(form)).toMatchObject({
			ok: false,
			message: 'Pick who will follow this up.'
		});
	});

	it('refuses an owner without a note', () => {
		const form = new FormData();
		form.set('conditionOwnerId', 'ann');
		expect(parseAcceptCondition(form)).toMatchObject({
			ok: false,
			message: 'Say what the accept depends on.'
		});
	});

	it('keeps the sentence the committee typed', () => {
		const form = new FormData();
		form.set('condition', '  bring a co-presenter  ');
		form.set('conditionOwnerId', 'ann');
		expect(parseAcceptCondition(form)).toEqual({
			ok: true,
			condition: { text: 'bring a co-presenter', ownerId: 'ann' }
		});
	});
});
