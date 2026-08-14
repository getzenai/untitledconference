import { describe, expect, it } from 'vitest';
import { dashboardMode, nextSetupStep } from './dashboard-mode';

describe('dashboardMode (#473)', () => {
	it('is setup while there is nothing to measure', () => {
		expect(dashboardMode(0)).toBe('setup');
	});

	it('flips to the dashboard on the first submission', () => {
		expect(dashboardMode(1)).toBe('measure');
		expect(dashboardMode(30)).toBe('measure');
	});
});

describe('nextSetupStep', () => {
	it('follows rooms, then tracks, then the call', () => {
		expect(nextSetupStep({ rooms: 0, tracks: 0, cfpOpen: false })).toBe('rooms');
		expect(nextSetupStep({ rooms: 2, tracks: 0, cfpOpen: false })).toBe('tracks');
		expect(nextSetupStep({ rooms: 2, tracks: 3, cfpOpen: false })).toBe('cfp');
		expect(nextSetupStep({ rooms: 2, tracks: 3, cfpOpen: true })).toBe('ready');
	});

	it('does not skip an earlier hole', () => {
		expect(nextSetupStep({ rooms: 0, tracks: 4, cfpOpen: true })).toBe('rooms');
	});
});
