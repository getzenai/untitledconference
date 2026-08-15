import { describe, expect, it } from 'vitest';
import {
	conferenceDateRange,
	conferenceNav,
	initialAppRail,
	isConferenceNavCurrent,
	isConferencePath,
	isConferenceRail,
	transitAppRail
} from './conference-nav';

describe('conferenceNav', () => {
	it('names scorecards and the reviewer pool on the destinations that hold them', () => {
		const items = conferenceNav('devflow-2028');

		expect(items.map((item) => item.href)).toEqual([
			'/manage/devflow-2028/dashboard',
			'/manage/devflow-2028/submissions',
			'/manage/devflow-2028/decisions',
			'/manage/devflow-2028/carry-forward',
			'/manage/devflow-2028/cfp',
			'/manage/devflow-2028/agenda',
			'/manage/devflow-2028/speakers',
			'/manage/devflow-2028/content',
			'/manage/devflow-2028/rounds',
			'/manage/devflow-2028/people',
			'/manage/devflow-2028/embed',
			'/manage/devflow-2028/settings'
		]);
		expect(items.find((item) => item.id === 'rounds')?.label).toBe('Rounds & scorecards');
		expect(items.find((item) => item.id === 'people')?.label).toBe('Reviewer pool');
		// The acceptance call is a place, not a mode of the submissions table (#444).
		expect(items.find((item) => item.id === 'decisions')?.label).toBe('Decision meeting');
		// Last year's declined talks are a place too (#448) — not a filter on
		// this year's pile, and not a lane you have to remember exists.
		expect(items.find((item) => item.id === 'carryForward')?.label).toBe('Carry forward');
	});
});

describe('isConferenceNavCurrent', () => {
	const items = conferenceNav('devflow-2028');
	const href = (id: (typeof items)[number]['id']) => items.find((item) => item.id === id)!.href;

	it('marks Decision meeting on /decisions and leaves Submissions dark', () => {
		const path = '/manage/devflow-2028/decisions';

		expect(isConferenceNavCurrent(path, href('decisions'))).toBe(true);
		expect(isConferenceNavCurrent(path, href('submissions'))).toBe(false);
	});

	it('marks Submissions on /submissions and leaves Decision meeting dark', () => {
		const path = '/manage/devflow-2028/submissions';

		expect(isConferenceNavCurrent(path, href('submissions'))).toBe(true);
		expect(isConferenceNavCurrent(path, href('decisions'))).toBe(false);
	});

	it('keeps a submission detail on Submissions, not Decision meeting', () => {
		const path = '/manage/devflow-2028/submissions/12';

		expect(isConferenceNavCurrent(path, href('submissions'))).toBe(true);
		expect(isConferenceNavCurrent(path, href('decisions'))).toBe(false);
	});
});

describe('isConferencePath', () => {
	it('treats a slug and its sections as the conference workspace', () => {
		expect(isConferencePath('/manage/devflow-2028')).toBe(true);
		expect(isConferencePath('/manage/devflow-2028/dashboard')).toBe(true);
		expect(isConferencePath('/manage/devflow-2028/submissions/12')).toBe(true);
	});

	it('leaves the conference list and the create form on the app rail alone', () => {
		expect(isConferencePath('/manage')).toBe(false);
		expect(isConferencePath('/manage/new')).toBe(false);
		expect(isConferencePath('/home')).toBe(false);
		expect(isConferencePath('/contacts')).toBe(false);
		// Review pages carry a `conference` payload; they are not this workspace.
		expect(isConferencePath('/review/devflow-2028')).toBe(false);
	});
});

describe('conferenceDateRange', () => {
	it('joins the dates and the venue the way the rail used to', () => {
		const range = conferenceDateRange({
			startsOn: '2028-05-12',
			endsOn: '2028-05-14',
			venue: 'Berlin'
		});
		// Calendar-day formatting is timezone-local; the seam under test is the join.
		expect(range).toMatch(/Berlin$/);
		expect(range).toContain(' · ');
	});
});

describe('isConferenceRail', () => {
	it('accepts the organizer layout payload and rejects everything else', () => {
		expect(isConferenceRail({ name: 'DevFlow Conf', slug: 'devflow-2028' })).toBe(true);
		expect(isConferenceRail(null)).toBe(false);
		expect(isConferenceRail({ name: 'no slug' })).toBe(false);
	});
});

describe('app rail across a conference', () => {
	it('starts expanded on the app surfaces and collapsed on a conference URL', () => {
		expect(initialAppRail('/home')).toEqual({
			open: true,
			savedOpen: true,
			inConference: false
		});
		expect(initialAppRail('/manage/devflow-2028/dashboard')).toEqual({
			open: false,
			savedOpen: true,
			inConference: true
		});
	});

	it('restores the default, not the first-paint collapse, after a deep link', () => {
		const landed = initialAppRail('/manage/devflow-2028/dashboard');
		expect(transitAppRail(landed, '/manage').open).toBe(true);
	});

	it('keeps a user-collapsed rail collapsed through a client-nav trip', () => {
		const home = { open: false, savedOpen: true, inConference: false };
		const inside = transitAppRail(home, '/manage/devflow-2028/dashboard');
		expect(inside.open).toBe(false);
		expect(transitAppRail(inside, '/manage').open).toBe(false);
	});

	it('restores a user-expanded rail after a client-nav trip', () => {
		const home = initialAppRail('/home');
		const inside = transitAppRail(home, '/manage/devflow-2028/settings');
		expect(inside.open).toBe(false);
		expect(transitAppRail(inside, '/manage').open).toBe(true);
	});
});
