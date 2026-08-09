import { SESSION_FRESH_AGE_SECONDS } from '$lib/constants';
import { describe, expect, it } from 'vitest';
import { isSessionFresh } from './session-freshness';

const FRESH_AGE = SESSION_FRESH_AGE_SECONDS;
const NOW = 1_700_000_000_000;

describe('isSessionFresh', () => {
	it('returns true for a session created just now', () => {
		expect(isSessionFresh(new Date(NOW), NOW, FRESH_AGE)).toBe(true);
	});

	it('returns true just inside the freshness window', () => {
		const createdAt = NOW - (FRESH_AGE * 1000 - 1000);
		expect(isSessionFresh(new Date(createdAt), NOW, FRESH_AGE)).toBe(true);
	});

	it('returns false at exactly the freshness boundary', () => {
		const createdAt = NOW - FRESH_AGE * 1000;
		expect(isSessionFresh(new Date(createdAt), NOW, FRESH_AGE)).toBe(false);
	});

	it('returns false for a session older than the window', () => {
		const createdAt = NOW - 2 * FRESH_AGE * 1000;
		expect(isSessionFresh(new Date(createdAt), NOW, FRESH_AGE)).toBe(false);
	});

	it('accepts ISO string timestamps', () => {
		expect(isSessionFresh(new Date(NOW - 1000).toISOString(), NOW, FRESH_AGE)).toBe(true);
	});

	it('returns false for missing or unparseable timestamps', () => {
		expect(isSessionFresh(null, NOW, FRESH_AGE)).toBe(false);
		expect(isSessionFresh(undefined, NOW, FRESH_AGE)).toBe(false);
		expect(isSessionFresh('not-a-date', NOW, FRESH_AGE)).toBe(false);
		// An Invalid Date object reaches the NaN guard via the Date branch.
		expect(isSessionFresh(new Date('not-a-date'), NOW, FRESH_AGE)).toBe(false);
	});

	it('treats freshAge of 0 as "freshness disabled"', () => {
		const createdAt = NOW - 10 * FRESH_AGE * 1000;
		expect(isSessionFresh(new Date(createdAt), NOW, 0)).toBe(true);
		// "Disabled" wins even when no timestamp is available.
		expect(isSessionFresh(null, NOW, 0)).toBe(true);
	});

	it('defaults to the shared SESSION_FRESH_AGE_SECONDS constant', () => {
		const justInside = NOW - (SESSION_FRESH_AGE_SECONDS * 1000 - 1000);
		const justOutside = NOW - SESSION_FRESH_AGE_SECONDS * 1000;

		expect(isSessionFresh(new Date(justInside), NOW)).toBe(true);
		expect(isSessionFresh(new Date(justOutside), NOW)).toBe(false);
	});

	it('treats a session created in the future as fresh (clock skew tolerance)', () => {
		expect(isSessionFresh(new Date(NOW + 60_000), NOW, FRESH_AGE)).toBe(true);
	});
});
