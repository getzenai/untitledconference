/**
 * The carry-forward invite lane (#448).
 *
 * Last year's declined talks, worked one at a time when the next edition
 * opens. Two answers, and only two: invite them onto this year's list, or
 * discard the row. Pending is the absence of a row, not a third value.
 */

export const CARRY_FORWARD_DISPOSITIONS = ['invited', 'discarded'] as const;
export type CarryForwardDisposition = (typeof CARRY_FORWARD_DISPOSITIONS)[number];

export function isCarryForwardDisposition(value: string): value is CarryForwardDisposition {
	return (CARRY_FORWARD_DISPOSITIONS as readonly string[]).includes(value);
}

export function carryForwardDispositionLabel(disposition: CarryForwardDisposition): string {
	return disposition === 'invited' ? 'On the invite list' : 'Discarded';
}
