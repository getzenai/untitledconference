/**
 * The two things this page got wrong on a real screen: it sat flush against the rail
 * with no padding, and a hundred speakers meant a hundred cards and no way to find
 * one. Both are invisible to every other test we have, so they get nailed down here.
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

const speaker = (id: number) => ({
	speakerProfileId: id,
	name: `Speaker ${id}`,
	// Nullable, like the column: an organizer-created speaker may have no address,
	// and CNT-08 has to leave that person out of a bulk send.
	email: `speaker${id}@example.test` as string | null,
	hasAccount: true,
	tasks: [
		{
			id: id * 10,
			title: `Slides ${id}`,
			kind: 'file_request',
			status: 'open',
			dueOn: null,
			fileCount: 0,
			latestFilename: null,
			latestApproval: null
		}
	],
	open: 1,
	waiting: 0,
	done: 0
});

const renderWith = (count: number) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				speakers: Array.from({ length: count }, (_, i) => speaker(i + 1)),
				totals: { speakers: count, open: count, waiting: 0, done: 0, overdue: 0 }
			},
			form: null
		}
	}).body;

describe('organizer speaker content layout', () => {
	it('gives the content a padded, bounded container instead of sitting flush against the rail', () => {
		const body = renderWith(3);

		// The header bar every other organizer page uses, then a body that is padded
		// and capped — the two properties Fabian's walkthrough found missing.
		expect(body).toMatch(/<div class="[^"]*border-b[^"]*px-6 py-5[^"]*"/);
		const container = body.match(/<div class="([^"]*max-w-5xl[^"]*)"/)?.[1];
		expect(container).toContain('px-6');
		expect(container).toContain('mx-auto');
	});

	// The pair either side of the threshold, not two points far away from it: a test
	// that only knows 3-versus-20 stays green if the threshold moves to 19.
	it('offers a filter at eight speakers and not at seven', () => {
		expect(renderWith(7)).not.toContain('data-testid="content-filter"');
		expect(renderWith(8)).toContain('data-testid="content-filter"');
	});
});

describe('organizer speaker content cards', () => {
	it('starts every card collapsed, with an open/total count on the header', () => {
		const body = renderWith(2);

		// Collapsed on first render — the task list markup is not in the SSR
		// output at all, not merely hidden by CSS.
		expect(body).not.toContain('Slides 1');
		expect(body).not.toContain('nothing handed in');
		expect(body).toMatch(/aria-expanded="false"/);
		expect(body.match(/aria-expanded="false"/g)).toHaveLength(2);
		// speaker() gives each speaker one open task, zero waiting, zero done.
		expect(body).toContain('1 open · 1 task');
	});

	it('is a real, keyboard-reachable toggle button, not a div with an onclick', () => {
		const body = renderWith(1);

		expect(body).toMatch(/<button[^>]*aria-expanded="false"[^>]*>/);
	});
});

/**
 * CNT-08. The checkbox is the promise that the button will send something, so the
 * cases that matter are the ones where it must NOT appear: nothing open, and nowhere
 * to send it. Both are skipped server-side, and a box over a skip would make
 * "3 selected" a lie about how many emails leave.
 */
describe('bulk deliverable reminders', () => {
	const renderSpeakers = (speakers: ReturnType<typeof speaker>[]) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers,
					totals: {
						speakers: speakers.length,
						open: speakers.reduce((sum, s) => sum + s.open, 0),
						waiting: 0,
						done: 0,
						overdue: 0
					}
				},
				form: null
			}
		}).body;

	it('offers a selection and a bulk send while somebody owes something', () => {
		const body = renderWith(2);

		expect(body).toContain('action="?/remindSpeakers"');
		expect(body).toContain('data-testid="deliverable-reminder-bar"');
		expect(body).toContain('name="speakerProfileIds" value="1"');
		expect(body).toContain('name="speakerProfileIds" value="2"');
	});

	it('leaves out the checkbox for a speaker with nothing open', async () => {
		const done = { ...speaker(1), open: 0, done: 1 };
		const body = renderSpeakers([done, speaker(2)]);

		expect(body).not.toContain('name="speakerProfileIds" value="1"');
		expect(body).toContain('name="speakerProfileIds" value="2"');
	});

	it('leaves out the checkbox for a speaker with no email address', () => {
		const unreachable = { ...speaker(1), email: null, hasAccount: false };
		const body = renderSpeakers([unreachable, speaker(2)]);

		expect(body).not.toContain('name="speakerProfileIds" value="1"');
		expect(body).toContain('name="speakerProfileIds" value="2"');
	});

	it('hides the bar entirely when nobody can be reminded', () => {
		const body = renderSpeakers([{ ...speaker(1), open: 0, done: 1 }]);

		expect(body).not.toContain('data-testid="deliverable-reminder-bar"');
		expect(body).not.toContain('name="speakerProfileIds"');
	});

	it('shows the send tally the action returns', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [speaker(1)],
					totals: { speakers: 1, open: 1, waiting: 0, done: 0, overdue: 0 }
				},
				form: { reminderMessage: '2 reminders queued · 1 already reminded' }
			}
		}).body;

		expect(body).toContain('2 reminders queued · 1 already reminded');
	});
});
