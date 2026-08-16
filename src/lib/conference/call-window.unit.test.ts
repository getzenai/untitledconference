/**
 * The window rule three callers share: the public submit handler, the organizer's
 * CFP banner and the unpublish confirmation (#452). Each had its own copy before.
 */
import { describe, expect, it } from 'vitest';
import { callWindow, directoryCall } from './call-window';

const now = new Date('2027-03-10T12:00:00Z');

describe('call window', () => {
	it('is open when there is no window at all', () => {
		expect(callWindow(null, null, false, now)).toBe('open');
	});

	it('is not yet open while the start is ahead', () => {
		expect(callWindow(new Date('2027-03-10T12:00:01Z'), null, false, now)).toBe('not_yet_open');
	});

	it('opens at the stated moment, and shuts at the stated moment', () => {
		// Inclusive at the start, exclusive at the end: at the stroke of the
		// deadline the form is shut, which is what a deadline means to a submitter.
		expect(callWindow(now, null, false, now)).toBe('open');
		expect(callWindow(null, now, false, now)).toBe('closed');
		expect(callWindow(null, new Date('2027-03-10T12:00:01Z'), false, now)).toBe('open');
	});

	it('is closed when the organizer closed it, whatever the dates say', () => {
		expect(callWindow(null, new Date('2027-12-01T00:00:00Z'), true, now)).toBe('closed');
	});

	it('reads timestamps that have been through JSON', () => {
		expect(callWindow('2027-03-10T12:00:01Z', null, false, now)).toBe('not_yet_open');
		expect(callWindow(null, '2027-03-01T00:00:00Z', false, now)).toBe('closed');
	});
});

describe('directory call', () => {
	it('is none when there is no published form — the CFP 404', () => {
		expect(directoryCall(null, now)).toBe('none');
		expect(directoryCall({ opensAt: null, closesAt: null, status: 'draft' }, now)).toBe('none');
	});

	it('is open only while callWindow is open', () => {
		expect(directoryCall({ opensAt: null, closesAt: null, status: 'published' }, now)).toBe('open');
		expect(
			directoryCall(
				{ opensAt: new Date('2027-03-10T12:00:01Z'), closesAt: null, status: 'published' },
				now
			)
		).toBe('closed');
		expect(directoryCall({ opensAt: null, closesAt: null, status: 'closed' }, now)).toBe('closed');
	});
});
