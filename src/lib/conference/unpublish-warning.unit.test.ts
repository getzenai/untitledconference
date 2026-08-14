/**
 * #452: what the organizer is told before taking a live conference offline.
 */
import { describe, expect, it } from 'vitest';
import { unpublishWarning } from './unpublish-warning';

describe('unpublish warning', () => {
	it('names the address that stops answering and both public surfaces', () => {
		const warning = unpublishWarning('devflow-2027', false);

		expect(warning.url).toBe('/c/devflow-2027');
		expect(warning.consequence).toContain('public conference page');
		expect(warning.consequence).toContain('submission form');
		expect(warning.consequence).toContain('404');
	});

	it('says nothing about speakers in flight when the call is not taking submissions', () => {
		expect(unpublishWarning('devflow-2027', false).inFlight).toBeNull();
	});

	it('names the interrupted speakers while the call is open', () => {
		const warning = unpublishWarning('devflow-2027', true);

		expect(warning.inFlight).toContain('open right now');
		expect(warning.inFlight).toContain('cannot send it');
	});
});
