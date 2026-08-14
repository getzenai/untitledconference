/**
 * The one place that says which forms may be reset after enhance (#461).
 *
 * Add-another wants the empty field back. A filled edit form never does —
 * that is the review scorecard, and every other server-backed form.
 */
import { describe, expect, it } from 'vitest';
import { formUpdateOptions, shouldResetForm } from './form-reset';

describe('shouldResetForm', () => {
	it('resets the empty field after add-another', () => {
		expect(shouldResetForm('add')).toBe(true);
		expect(formUpdateOptions('add')).toEqual({ reset: true });
	});

	it('never resets a filled edit form', () => {
		expect(shouldResetForm('edit')).toBe(false);
		expect(formUpdateOptions('edit')).toEqual({ reset: false });
	});
});
