import { describe, expect, it } from 'vitest';
import { carryForwardDispositionLabel, isCarryForwardDisposition } from './carry-forward';

describe('isCarryForwardDisposition', () => {
	it('accepts the two answers the lane writes', () => {
		expect(isCarryForwardDisposition('invited')).toBe(true);
		expect(isCarryForwardDisposition('discarded')).toBe(true);
	});

	it('refuses everything else, including a third status someone might invent', () => {
		expect(isCarryForwardDisposition('pending')).toBe(false);
		expect(isCarryForwardDisposition('accepted')).toBe(false);
		expect(isCarryForwardDisposition('')).toBe(false);
	});
});

describe('carryForwardDispositionLabel', () => {
	it('names the invite list in the organizer’s words, not the column’s', () => {
		expect(carryForwardDispositionLabel('invited')).toBe('On the invite list');
		expect(carryForwardDispositionLabel('discarded')).toBe('Discarded');
	});
});
