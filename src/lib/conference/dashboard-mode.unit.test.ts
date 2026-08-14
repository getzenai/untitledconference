import { describe, expect, it } from 'vitest';
import { dashboardMode, nextSetupStep, type DashboardWaiting } from './dashboard-mode';

const nothing: DashboardWaiting = {
	submissions: 0,
	speakers: 0,
	queuedMail: 0,
	failedMail: 0,
	tasks: 0
};

describe('dashboardMode (#473)', () => {
	it('is setup while there is nothing to measure', () => {
		expect(dashboardMode(nothing)).toBe('setup');
	});

	it('flips on the first submission', () => {
		expect(dashboardMode({ ...nothing, submissions: 1 })).toBe('measure');
		expect(dashboardMode({ ...nothing, submissions: 30 })).toBe('measure');
	});

	it('flips on a speaker with no submission', () => {
		expect(dashboardMode({ ...nothing, speakers: 1 })).toBe('measure');
	});

	it('flips on queued or failed mail', () => {
		expect(dashboardMode({ ...nothing, queuedMail: 1 })).toBe('measure');
		expect(dashboardMode({ ...nothing, failedMail: 1 })).toBe('measure');
	});

	it('flips on an open task', () => {
		expect(dashboardMode({ ...nothing, tasks: 1 })).toBe('measure');
	});
});

describe('nextSetupStep', () => {
	it('follows rooms, then the call — tracks do not block', () => {
		expect(nextSetupStep({ rooms: 0, tracks: 0, cfpOpen: false })).toBe('rooms');
		expect(nextSetupStep({ rooms: 2, tracks: 0, cfpOpen: false })).toBe('cfp');
		expect(nextSetupStep({ rooms: 2, tracks: 3, cfpOpen: false })).toBe('cfp');
		expect(nextSetupStep({ rooms: 2, tracks: 0, cfpOpen: true })).toBe('ready');
		expect(nextSetupStep({ rooms: 2, tracks: 3, cfpOpen: true })).toBe('ready');
	});

	it('does not skip an earlier hole', () => {
		expect(nextSetupStep({ rooms: 0, tracks: 4, cfpOpen: true })).toBe('rooms');
	});
});
