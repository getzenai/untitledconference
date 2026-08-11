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
					},
					templates: []
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
					config: { rooms: [], tracks: [], formats: [] },
					templates: []
				} as never,
				form: { error: 'Give the room a name.' }
			}
		});

		expect(body).toContain('data-testid="settings-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('Give the room a name.');
		// The claim is that the failure did not come back on the success channel, and
		// this is the assertion that says exactly that. It used to be backed up by
		// searching the whole page for `text-status-good` and `role="status"` — but the
		// "Live" badge on the visibility section is green on the same token for an
		// unrelated reason, so a page-wide search now answers a different question.
		expect(body).not.toContain('data-testid="settings-message"');
	});

	it('keeps real success messages on the green status channel', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates: []
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
					config: { rooms: [], tracks: [], formats: [] },
					templates: []
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

/**
 * The switch that decides whether the public half of the product exists at all.
 *
 * `conference.status` had no writer in the app before this: everything an
 * organizer created stayed `draft`, and `draft` is what the public site, the
 * front-door directory and the public CFP form all filter out.
 */
describe('draft or live', () => {
	const renderVisibility = (status: 'draft' | 'published') =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: { ...conference, status },
					config: { rooms: [], tracks: [], formats: [] },
					templates: []
				} as never,
				form: null
			}
		}).body;

	it('offers to publish a draft, and says what staying a draft costs', () => {
		const body = renderVisibility('draft');

		expect(body).toContain('data-testid="settings-visibility"');
		expect(body).toContain('action="?/visibility"');
		expect(body).toContain('Publish');
		expect(body).toContain('404');
	});

	it('offers the way back once it is live, and links the address it went live at', () => {
		const body = renderVisibility('published');

		expect(body).toContain('Return to draft');
		expect(body).toContain('/c/test-conf');
		expect(body).not.toContain('404');
	});

	/**
	 * The hidden field carries the state the organizer is asking for, not "flip it".
	 * A tab left open on the old value would otherwise publish a conference its
	 * owner had just taken down — the button and the payload must disagree exactly
	 * this way round.
	 */
	it('posts the wanted state rather than a toggle', () => {
		expect(renderVisibility('draft')).toContain('name="published" value="true"');
		expect(renderVisibility('published')).toContain('name="published" value="false"');
	});
});

/**
 * Speaker tasks — the section the deliverables screen has been pointing at.
 *
 * The generator on the accept path was never missing; the way to feed it was.
 * These check the two states an organizer meets: nothing yet (say so, plainly)
 * and a template that can be edited or removed without leaving the page.
 */
describe('task templates on settings', () => {
	const render_ = (templates: unknown[]) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates
				} as never,
				form: null
			}
		}).body;

	it('says what an acceptance would hand out when there is nothing', () => {
		const body = render_([]);

		expect(body).toContain('data-testid="settings-task-templates"');
		expect(body).toContain('accepting a talk will ask its speakers for nothing');
		expect(body).toContain('action="?/addTemplate"');
	});

	it('offers each template for editing and removal', () => {
		const body = render_([
			{
				id: 7,
				title: 'Upload your slides',
				instructions: 'PDF only',
				kind: 'file_request',
				dueOffsetDays: 14,
				dueOn: null,
				position: 0
			}
		]);

		expect(body).toContain('Upload your slides');
		expect(body).toContain('PDF only');
		expect(body).toContain('action="?/updateTemplate"');
		expect(body).toContain('action="?/deleteTemplate"');
		expect(body).toContain('value="7"');
		expect(body).toContain('value="14"');
	});

	/**
	 * A stored timestamp has to come back as the `YYYY-MM-DD` the date input takes,
	 * or the field renders empty and saving the row silently drops the due date.
	 */
	it('puts a fixed due date back into the date field', () => {
		const body = render_([
			{
				id: 8,
				title: 'Confirm your bio',
				instructions: null,
				kind: 'action',
				dueOffsetDays: null,
				dueOn: new Date('2028-05-01T12:00:00.000Z'),
				position: 0
			}
		]);

		expect(body).toContain('value="2028-05-01"');
	});
});
