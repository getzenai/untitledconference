import { describe, expect, it } from 'vitest';
import {
	conferenceDateRange,
	conferenceNav,
	isConferencePath,
	isConferenceRail
} from './conference-nav';

describe('conferenceNav', () => {
	it('names scorecards and the reviewer pool on the destinations that hold them', () => {
		const items = conferenceNav('devflow-2028');

		expect(items.map((item) => item.href)).toEqual([
			'/manage/devflow-2028/dashboard',
			'/manage/devflow-2028/submissions',
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
