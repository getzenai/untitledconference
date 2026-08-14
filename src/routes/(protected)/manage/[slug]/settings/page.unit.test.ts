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
	listedPublicly: true,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

describe('setup landing after creating a conference', () => {
	const renderSetup = (status: 'draft' | 'published' = 'draft') =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: { ...conference, status },
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {},
					setup: true
				} as never,
				form: null
			}
		}).body;

	it('names the draft and points at Publish, not the CFP', () => {
		const body = renderSetup('draft');

		expect(body).toContain('data-testid="settings-setup-hint"');
		expect(body).toContain('This conference is a draft');
		expect(body).toContain('href="#visibility"');
		expect(body).toContain('Publish, in General below');
		expect(body).toContain('/c/test-conf');
		expect(body).toContain('404');
		expect(body).not.toContain('Start with the structure');
		expect(body).not.toContain('Call for papers');
	});

	it('does not keep the draft banner after the conference is live', () => {
		const body = renderSetup('published');

		expect(body).not.toContain('data-testid="settings-setup-hint"');
		expect(body).not.toContain('This conference is a draft');
	});
});

describe('conference settings config surface', () => {
	it('lists rooms, tracks and formats and does not host review visibility', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: {
						rooms: [{ id: 1, name: 'Main Stage', position: 0 }],
						tracks: [{ id: 2, name: 'AI Engineering', position: 0 }],
						formats: [{ id: 3, name: 'Talk', minutes: 30, position: 0 }]
					},
					templates: [],
					pending: {}
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="settings-rooms"');
		expect(body).toContain('data-testid="settings-tracks"');
		expect(body).toContain('data-testid="settings-formats"');
		expect(body).toContain('data-testid="settings-sponsors"');
		expect(body).toContain('Main Stage');
		expect(body).toContain('AI Engineering');
		expect(body).toContain('Talk');
		expect(body).toContain('action="?/addRoom"');
		expect(body).toContain('action="?/addTrack"');
		expect(body).toContain('action="?/addFormat"');
		expect(body).toContain('action="?/addSponsorTier"');
		expect(body).not.toContain('What reviewers see of each other');
		expect(body).not.toContain('action="?/reviewVisibility"');
		expect(body).toContain('/manage/test-conf/people');
	});

	it('renders a rejected add as a red alert, not a green success', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
				} as never,
				form: { error: 'That start date is not a real date.', section: 'dates' }
			}
		});

		expect(body).toContain('data-testid="settings-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('That start date is not a real date.');
		// Date errors land inside the dates section, not as a floating page banner —
		// that is the whole point of section-scoped feedback after the jump nav.
		expect(body).toMatch(
			/data-testid="settings-dates"[\s\S]*data-testid="settings-error"[\s\S]*That start date/
		);
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
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
				} as never,
				form: { message: 'Dates saved.', section: 'dates' }
			}
		});

		expect(body).toContain('data-testid="settings-message"');
		expect(body).toContain('role="status"');
		expect(body).toContain('text-status-good');
		expect(body).toContain('Dates saved.');
		expect(body).toMatch(
			/data-testid="settings-dates"[\s\S]*data-testid="settings-message"[\s\S]*Dates saved/
		);
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
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: { ...conference, startsOn: '2028-05-12', endsOn: '2028-05-14', ...over },
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
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
	const renderVisibility = (status: 'draft' | 'published', listedPublicly = true) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference: { ...conference, status, listedPublicly },
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
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
	 * Published and listed are two questions (#402): a conference reachable at its
	 * own address is not automatically one the front page advertises. The switch
	 * appears only once there is something to advertise.
	 */
	it('offers to advertise a live conference, and says which state it is in', () => {
		const listed = renderVisibility('published', true);
		const unlisted = renderVisibility('published', false);

		expect(listed).toContain('action="?/listing"');
		expect(listed).toContain('Remove from the front page');
		expect(listed).toContain('Listed in the public directory');

		expect(unlisted).toContain('Show on the front page');
		expect(unlisted).toContain('reachable only through its own link');
	});

	it('does not offer the front page to a draft nobody can reach yet', () => {
		const body = renderVisibility('draft');

		expect(body).not.toContain('action="?/listing"');
		expect(body).not.toContain('front page');
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
	const render_ = (templates: unknown[], pending: Record<number, number> = {}) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates,
					pending
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

	it('does not suggest an upload on a task the speaker only has to tick', () => {
		// A greyed placeholder reads as stored text, and this one described a file
		// the task does not accept: "Confirm participation … 16:9, PDF, no larger
		// than 20 MB" was the reported sighting.
		//
		// Scoped to the existing-template rows, not the whole body: the persistent
		// "add a task" form below always shows an Instructions field of its own
		// (defaulting to the file-request hint), so the file hint legitimately
		// appears once regardless of which templates already exist.
		const templateRows = (body: string) => body.split('action="?/addTemplate"')[0];

		const action = templateRows(
			render_([
				{
					id: 7,
					title: 'Confirm participation',
					instructions: null,
					kind: 'action',
					dueOffsetDays: null,
					dueOn: null,
					position: 0
				}
			])
		);

		expect(action).not.toContain('16:9, PDF, no larger than 20 MB');
		expect(action).toContain('Anything the speaker needs to know');

		const upload = templateRows(
			render_([
				{
					id: 8,
					title: 'Upload your slides',
					instructions: null,
					kind: 'file_request',
					dueOffsetDays: null,
					dueOn: null,
					position: 0
				}
			])
		);

		expect(upload).toContain('16:9, PDF, no larger than 20 MB');
	});

	it('shows the add-task Instructions field immediately, before any save', () => {
		// Fabian's review: picking "Upload a file" in the add-task form should show
		// the Instructions field right away, not only after the new task round-trips
		// through a save and becomes an editable template row.
		const body = render_([]);

		expect(body).toContain('action="?/addTemplate"');
		const addForm = body.split('action="?/addTemplate"')[1];
		expect(addForm).toContain('Instructions (optional)');
		expect(addForm).toContain('16:9, PDF, no larger than 20 MB');
	});

	it('offers to give a task to the speakers already accepted, and says how many', () => {
		const body = render_(
			[
				{
					id: 7,
					title: 'Upload Session Presentation',
					instructions: null,
					kind: 'file_request',
					dueOffsetDays: null,
					dueOn: null,
					position: 0
				}
			],
			{ 7: 3 }
		);

		expect(body).toContain('action="?/handOutTemplate"');
		expect(body).toContain('Give to 3 accepted speakers still missing it');
		expect(body).toContain(
			'title="Assign this task to accepted speakers who do not have it yet. New acceptances already get templates automatically."'
		);
	});

	it('says speaker, singular, when exactly one is missing it', () => {
		const body = render_(
			[
				{
					id: 7,
					title: 'Upload Session Presentation',
					instructions: null,
					kind: 'file_request',
					dueOffsetDays: null,
					dueOn: null,
					position: 0
				}
			],
			{ 7: 1 }
		);

		expect(body).toContain('Give to 1 accepted speaker still missing it');
	});

	it('does not offer it when every accepted speaker already has the task', () => {
		// A button that always reads "give to 0 speakers" is one an organizer
		// learns to ignore, and it is the state most templates are in.
		const body = render_(
			[
				{
					id: 7,
					title: 'Upload your slides',
					instructions: null,
					kind: 'file_request',
					dueOffsetDays: null,
					dueOn: null,
					position: 0
				}
			],
			{ 7: 0 }
		);

		expect(body).not.toContain('action="?/handOutTemplate"');
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

/**
 * Structure setup one row per submit is what ate two thirds of the first
 * calibration run's turn budget (#110). The fields take a whole list, and the
 * confirmation appears next to the list it is about rather than a screen away.
 */
describe('adding structure a list at a time', () => {
	const renderForm = (form: unknown) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
				} as never,
				form: form as never
			}
		}).body;

	it('offers a multi-line field for rooms, tracks and formats', () => {
		const body = renderForm(null);

		// A textarea, not an input: an `<input>` drops the newlines out of a paste,
		// so the whole batch would arrive as one very long room name.
		expect(body).toContain('name="names"');
		expect(body).toContain('name="formats"');
		expect(body).not.toContain('name="minutes"');
		expect(body.match(/<textarea/g)?.length).toBeGreaterThanOrEqual(3);
		expect(body).toContain('one per line');
	});

	it('puts the confirmation inside the section that was submitted', () => {
		const body = renderForm({ message: 'Added 3 rooms.', section: 'rooms' });

		expect(body).toContain('Added 3 rooms.');
		// Inside the rooms card, which is what makes it an answer rather than a
		// notice at the other end of the page.
		const rooms = body.slice(body.indexOf('data-testid="settings-rooms"'));
		expect(rooms.slice(0, rooms.indexOf('</section>'))).toContain('Added 3 rooms.');
	});

	it('shows a rejected line as an alert in its own section', () => {
		const body = renderForm({ error: 'Give the room a name.', section: 'rooms' });

		expect(body).toContain('data-testid="settings-error"');
		expect(body).not.toContain('data-testid="settings-message"');
		const rooms = body.slice(body.indexOf('data-testid="settings-rooms"'));
		expect(rooms.slice(0, rooms.indexOf('</section>'))).toContain('Give the room a name.');
	});

	// One message, in one place: the same text at the top and in the section would
	// read as two things having happened.
	it('does not repeat a sectioned message at the top of the page', () => {
		const body = renderForm({ message: 'Added 3 rooms.', section: 'rooms' });

		expect(body.match(/Added 3 rooms\./g)).toHaveLength(1);
	});
});

/**
 * A list you can only add to (#119).
 *
 * Every row now carries its own name field and its own Remove, and the two are
 * separate forms on purpose: a browser will not nest forms, and a Remove that
 * posted the half-typed name next to it would be two intentions on one button.
 */
describe('editing a room, track or format in place', () => {
	const body = render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				config: {
					rooms: [{ id: 11, name: 'Main Stage', position: 0 }],
					tracks: [{ id: 22, name: 'AI Engineering', position: 0 }],
					formats: [{ id: 33, name: 'Talk', minutes: 30, position: 0 }]
				},
				sponsorTiers: [{ id: 44, name: 'Gold', note: 'paid keynote', position: 0 }],
				templates: [],
				pending: {}
			} as never,
			form: null
		}
	}).body;

	it('gives every row an edit form and a remove form of its own', () => {
		for (const action of [
			'?/renameRoom',
			'?/deleteRoom',
			'?/renameTrack',
			'?/deleteTrack',
			'?/updateFormat',
			'?/deleteFormat',
			'?/updateSponsorTier',
			'?/deleteSponsorTier'
		]) {
			expect(body).toContain(`action="${action}"`);
		}

		for (const id of ['11', '22', '33', '44']) {
			expect(body).toContain(`name="id" value="${id}"`);
		}
	});

	it('starts the fields at what is stored, so a save is an edit and not a retype', () => {
		expect(body).toContain('value="Main Stage"');
		expect(body).toContain('value="AI Engineering"');
		expect(body).toContain('value="Talk"');
		expect(body).toContain('value="30"');
		expect(body).toContain('value="Gold"');
		expect(body).toContain('value="paid keynote"');
	});

	/**
	 * A format with no length set must come back with an empty minutes field, not
	 * a zero: zero minutes is a real number the form would happily post, and it
	 * would flatten every agenda end time that format touches.
	 */
	it('leaves the length blank for a format nobody has measured', () => {
		const unmeasured = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: {
						rooms: [],
						tracks: [],
						formats: [{ id: 33, name: 'Panel', minutes: null, position: 0 }]
					},
					templates: [],
					pending: {}
				} as never,
				form: null
			}
		}).body;

		expect(unmeasured).toContain('name="minutes"');
		expect(unmeasured).not.toContain('value="0"');
	});
});

/**
 * The section nav (#153). Seven sections stacked in one column made this the
 * longest page in the product: you had to scroll past the rooms to find out
 * that session formats exist at all. The nav is the fix, and the thing that
 * makes it a fix rather than decoration is that every entry points at a section
 * that is really on the page — a jump list with a dead link is worse than no
 * jump list. These assertions are what catches a renamed or dropped section.
 */
describe('settings section nav', () => {
	const body = () =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: [], tracks: [], formats: [] },
					templates: [],
					pending: {}
				} as never,
				form: null
			}
		}).body;

	const ANCHORS = ['visibility', 'dates', 'rooms', 'tracks', 'formats', 'sponsors', 'tasks'];

	it('offers a jump to every section without moving anything off the page', () => {
		const rendered = body();

		for (const anchor of ANCHORS) {
			expect(rendered).toContain(`href="#${anchor}"`);
			expect(rendered).toContain(`id="${anchor}"`);
		}
		// Everything still renders at once — this is a table of contents, not tabs.
		// Hiding five of six sections behind a click would put the page into a
		// state that every one of its six form posts would have to preserve.
		expect(rendered).toContain('data-testid="settings-visibility"');
		expect(rendered).toContain('data-testid="settings-task-templates"');
	});

	it('marks a current entry before any script has run', () => {
		// Server-rendered, so the nav does not arrive as six identical links and
		// then jump. The observer takes over from here.
		expect(body()).toContain('aria-current="true"');
	});

	it('labels the jump list with the section names from the brief', () => {
		const rendered = body();
		for (const label of [
			'General',
			'Dates',
			'Rooms',
			'Tracks',
			'Session formats',
			'Sponsor tiers',
			'Speaker tasks'
		]) {
			expect(rendered).toContain(label);
		}
		expect(rendered).toContain('data-testid="settings-section-nav"');
	});
});

/**
 * Long structure lists start collapsed (#153). Five rows is enough to recognise
 * the list; the rest opens on demand. Without this the jump nav would still
 * force a long scroll through a venue with twelve rooms.
 */
describe('settings list preview', () => {
	const manyRooms = Array.from({ length: 7 }, (_, i) => ({
		id: i + 1,
		name: `Room ${i + 1}`,
		position: i
	}));

	it('shows a preview of long room lists and a control to open the rest', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: { rooms: manyRooms, tracks: [], formats: [] },
					templates: [],
					pending: {}
				} as never,
				form: null
			}
		});

		// Five visible, the rest gated behind the control.
		expect(body.match(/data-testid="settings-room-row"/g)?.length).toBe(5);
		expect(body).toContain('data-testid="settings-show-more-rooms"');
		expect(body).toContain('Show all 7 rooms');
		expect(body).toContain('Room 1');
		expect(body).toContain('Room 5');
		expect(body).not.toContain('Room 6');
		expect(body).not.toContain('Room 7');
	});

	it('does not show the expand control when the list fits the preview', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					config: {
						rooms: [
							{ id: 1, name: 'Main Stage', position: 0 },
							{ id: 2, name: 'Room B', position: 1 }
						],
						tracks: [],
						formats: []
					},
					templates: [],
					pending: {}
				} as never,
				form: null
			}
		});

		expect(body).not.toContain('data-testid="settings-show-more-rooms"');
		expect(body).toContain('Main Stage');
		expect(body).toContain('Room B');
	});
});
