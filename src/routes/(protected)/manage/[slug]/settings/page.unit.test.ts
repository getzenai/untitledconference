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
