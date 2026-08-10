/**
 * Settings is the home of conference structure (#63): rooms, tracks, formats.
 * Reviewer visibility lives under Team & reviewers, not here.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

describe('conference settings config surface', () => {
	it('lists rooms, tracks and formats and does not host review visibility', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: {
						rooms: [{ id: 1, name: 'Main Stage', position: 0 }],
						tracks: [{ id: 2, name: 'AI Engineering', position: 0 }],
						formats: [{ id: 3, name: 'Talk', minutes: 30, position: 0 }]
					}
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="settings-rooms"');
		expect(body).toContain('data-testid="settings-tracks"');
		expect(body).toContain('data-testid="settings-formats"');
		expect(body).toContain('Main Stage');
		expect(body).toContain('AI Engineering');
		expect(body).toContain('Talk');
		expect(body).toContain('action="?/addRoom"');
		expect(body).toContain('action="?/addTrack"');
		expect(body).toContain('action="?/addFormat"');
		expect(body).not.toContain('What reviewers see of each other');
		expect(body).not.toContain('action="?/reviewVisibility"');
		expect(body).toContain('/manage/test-conf/people');
	});

	it('renders a rejected add as a red alert, not a green success', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] }
				} as never,
				form: { error: 'Give the room a name.' }
			}
		});

		expect(body).toContain('data-testid="settings-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('Give the room a name.');
		expect(body).not.toContain('data-testid="settings-message"');
		expect(body).not.toContain('text-status-good');
		expect(body).not.toContain('role="status"');
	});

	it('keeps real success messages on the green status channel', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] }
				} as never,
				form: { message: 'Room added.' }
			}
		});

		expect(body).toContain('data-testid="settings-message"');
		expect(body).toContain('role="status"');
		expect(body).toContain('text-status-good');
		expect(body).toContain('Room added.');
		expect(body).not.toContain('data-testid="settings-error"');
		expect(body).not.toContain('text-status-bad');
		expect(body).not.toContain('role="alert"');
	});
});

/**
 * The date range is the only way to give a conference days (#86). Before this,
 * the agenda's empty board pointed here and the page had nothing to offer.
 */
describe('conference date range', () => {
	const renderDates = (over: { startsOn?: string | null; endsOn?: string | null } = {}) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: { ...conference, startsOn: '2028-05-12', endsOn: '2028-05-14', ...over },
					config: { rooms: [], tracks: [], formats: [] }
				} as never,
				form: null
			}
		}).body;

	it('asks for start and end and shows what is already stored', () => {
		const body = renderDates();

		expect(body).toContain('data-testid="settings-dates"');
		expect(body).toContain('action="?/dates"');
		expect(body).toContain('name="startsOn"');
		expect(body).toContain('name="endsOn"');
		// Both values have to come back into the fields, or saving one would clear
		// the other — the form posts whatever is in the inputs.
		expect(body).toContain('value="2028-05-12"');
		expect(body).toContain('value="2028-05-14"');
	});

	it('leaves the fields empty for a conference whose dates are not settled', () => {
		const body = renderDates({ startsOn: null, endsOn: null });

		expect(body).toContain('name="startsOn"');
		expect(body).not.toContain('value="2028-05-12"');
	});
});
