import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	status: 'published' as 'draft' | 'published' | 'archived',
	statusBeforeArchive: null,
	listedPublicly: false,
	slotCapacity: null,
	predecessorConferenceId: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const emptyDashboard = {
	mode: 'measure' as const,
	setup: { rooms: 2, tracks: 2, cfpOpen: true, submissions: 1, speakers: 0 },
	decisions: { undecided: 0, unreviewed: 0, items: [] },
	scheduling: { accepted: 0, unplaced: 0, tentative: 0, items: [] },
	tasks: { open: 0, overdue: 0, dueSoon: 0, items: [] },
	mail: { queued: 0, sent: 0, failed: 0, items: [] },
	reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] },
	inconsistencies: { count: 0, items: [] },
	submissionsOverTime: []
};

type Reviewer = {
	userId: string;
	name: string;
	email: string;
	assigned: number;
	submitted: number;
	outstanding: number;
	reminderStatus: null | 'queued' | 'sent';
};

const reviewer = (
	userId: string,
	outstanding: number,
	reminderStatus: Reviewer['reminderStatus'] = null
): Reviewer => ({
	userId,
	name: `Riley ${userId}`,
	email: `${userId}@example.com`,
	assigned: 3,
	submitted: 3 - outstanding,
	outstanding,
	reminderStatus
});

function pageWith(items: Reviewer[]) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				mailDeliveryConfigured: true,
				dashboard: {
					...emptyDashboard,
					reviews: {
						assigned: items.reduce((sum, item) => sum + item.assigned, 0),
						submitted: items.reduce((sum, item) => sum + item.submitted, 0),
						outstanding: items.reduce((sum, item) => sum + item.outstanding, 0),
						items
					}
				}
			} as PageData,
			form: null
		}
	}).body;
}

function page(outstanding: number, reminderStatus: null | 'queued' = null) {
	return pageWith([reviewer('reviewer-1', outstanding, reminderStatus)]);
}

describe('per-reviewer progress', () => {
	it('shows assigned versus submitted and exposes a reminder for outstanding work', () => {
		const body = page(2);

		expect(body).toContain('Reviewer progress');
		expect(body).toContain('1/3 submitted');
		expect(body).toContain('formaction="?/remindReviewer"');
		expect(body).toContain('Send reminder');
	});

	it('replaces the action with the observable reminder state', () => {
		const body = page(2, 'queued');

		expect(body).toContain('Reminder queued');
		expect(body).not.toContain('Send reminder');
	});
});

/**
 * ABS-09. The checkbox is the promise that the button will do something, so the
 * cases that matter are the ones where it must NOT appear: a reviewer who is
 * finished and a reviewer who is already carrying a reminder.
 */
describe('bulk reminders', () => {
	it('offers a selection and a bulk action while somebody is behind', () => {
		const body = pageWith([reviewer('reviewer-1', 2), reviewer('reviewer-2', 1)]);

		expect(body).toContain('action="?/remindReviewers"');
		expect(body).toContain('data-testid="send-reminders"');
		expect(body).toContain('name="reviewerIds" value="reviewer-1"');
		expect(body).toContain('name="reviewerIds" value="reviewer-2"');
	});

	it('leaves out the checkbox for reviewers a reminder would skip', () => {
		const body = pageWith([
			reviewer('behind', 2),
			reviewer('done', 0),
			reviewer('already-chased', 2, 'sent')
		]);

		expect(body).toContain('name="reviewerIds" value="behind"');
		expect(body).not.toContain('value="done"');
		expect(body).not.toContain('value="already-chased"');
	});

	it('hides the bulk bar entirely when nobody can be reminded', () => {
		const body = pageWith([reviewer('done', 0)]);

		expect(body).not.toContain('data-testid="reminder-bulk-bar"');
		expect(body).not.toContain('data-testid="select-all-reviewers"');
	});
});

/**
 * The metric row. A dashboard's default failure is a strip of totals that look
 * like a summary, get read once and never again — so every tile here is a count
 * somebody has to act on, and every tile is a link to the screen it is acted on.
 */
describe('dashboard metrics', () => {
	const withCounts = () =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					dashboard: {
						...emptyDashboard,
						decisions: { undecided: 7, unreviewed: 3, items: [] },
						scheduling: { accepted: 12, unplaced: 2, tentative: 1, items: [] },
						tasks: { open: 5, overdue: 2, dueSoon: 1, items: [] },
						reviews: { assigned: 9, submitted: 5, outstanding: 4, items: [] }
					}
				} as unknown as PageData,
				form: null
			}
		}).body;

	it('leads with the four counts that decide what happens next', () => {
		const body = withCounts();

		expect(body).toContain('data-testid="dashboard-metrics"');
		expect(body).toContain('Awaiting a decision');
		expect(body).toContain('Reviews outstanding');
		expect(body).toContain('Speaker tasks overdue');
	});

	it('makes every tile a way in, not just a figure', () => {
		const body = withCounts();

		expect(body).toContain('/manage/test-conf/submissions?status=submitted&amp;status=in_review');
		expect(body).toContain('/manage/test-conf/submissions?status=accepted');
		expect(body).toContain('/manage/test-conf/people');
		expect(body).toContain('/manage/test-conf/content');
	});

	/**
	 * `tabular-nums` gives every digit the width of a zero, which makes a large
	 * standalone number look like it has come apart. It belongs in columns that
	 * align, not on a tile value.
	 */
	it('sets the tile values in proportional figures', () => {
		expect(withCounts()).not.toMatch(/tabular-nums[^"]*"[^>]*>\s*7\s*</);
	});

	/**
	 * One tile is allowed to raise its voice, and only one: overdue means late,
	 * where the other three mean open. Four tinted tiles would be a wall of alarm
	 * that says nothing about where to start.
	 */
	it('tints the overdue tile and leaves the open ones alone', () => {
		const tiles = withCounts()
			.split('data-testid="dashboard-metrics"')[1]
			.split('data-testid="submissions-over-time"')[0]
			.split('<a ')
			.slice(1)
			.map((tile) => tile.split('</a>')[0]);

		expect(tiles).toHaveLength(4);
		const tinted = tiles.filter((tile) => tile.includes('text-status-bad'));
		expect(tinted).toHaveLength(1);
		expect(tinted[0]).toContain('/manage/test-conf/content');
	});

	it('makes each speaker-task row a way into the task', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					dashboard: {
						...emptyDashboard,
						tasks: {
							open: 1,
							overdue: 1,
							dueSoon: 0,
							items: [
								{
									id: 42,
									title: 'Confirm participation',
									speaker: 'Priya Raman',
									dueOn: new Date('2027-04-01T00:00:00Z'),
									overdue: true
								}
							]
						},
						reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] }
					}
				} as unknown as PageData,
				form: null
			}
		}).body;

		expect(body).toContain('href="/manage/test-conf/content/tasks/42"');
		expect(body).toContain('Confirm participation');
	});

	it('drops the tint once nothing is overdue', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					dashboard: {
						...emptyDashboard,
						tasks: { open: 5, overdue: 0, dueSoon: 1, items: [] },
						reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] }
					}
				} as unknown as PageData,
				form: null
			}
		}).body;

		expect(body).not.toContain('text-status-bad');
	});
});

/**
 * The chart says what the shape is; the trend line says which way it points.
 * Both halves have to survive the empty conference, where there is no honest
 * comparison to draw and the right answer is to print nothing.
 */
describe('submissions trend line', () => {
	const withDays = (counts: number[]) =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					dashboard: {
						...emptyDashboard,
						reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] },
						submissionsOverTime: counts.map((count, i) => ({
							day: `2027-03-${String(i + 1).padStart(2, '0')}`,
							count
						}))
					}
				} as unknown as PageData,
				form: null
			}
		}).body;

	it('prints both weeks, not just an arrow', () => {
		const body = withDays([1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3]);

		expect(body).toContain('data-testid="submissions-trend"');
		expect(body).toContain('21 in the last 7 days');
		expect(body).toContain('up from');
		expect(body).toContain('7 the week before');
	});

	it('stays silent before two full weeks exist', () => {
		expect(withDays([5, 5, 5])).not.toContain('data-testid="submissions-trend"');
		expect(withDays([])).not.toContain('data-testid="submissions-trend"');
	});
});

/**
 * The reviewer box after #82: a comparison, not a list of fractions.
 */
describe('reviewer progress as a comparison', () => {
	const reviewer = (name: string, submitted: number, assigned: number) => ({
		userId: `u-${name}`,
		name,
		email: `${name.toLowerCase()}@example.com`,
		assigned,
		submitted,
		outstanding: assigned - submitted,
		reminderStatus: null
	});

	function withReviewers(items: ReturnType<typeof reviewer>[]) {
		return render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					mailDeliveryConfigured: true,
					dashboard: {
						...emptyDashboard,
						reviews: {
							assigned: items.reduce((n, r) => n + r.assigned, 0),
							submitted: items.reduce((n, r) => n + r.submitted, 0),
							outstanding: items.reduce((n, r) => n + r.outstanding, 0),
							items
						}
					}
				} as PageData,
				form: null
			}
		}).body;
	}

	/**
	 * The query returns reviewers alphabetically, which is right for a general
	 * function and wrong for this box: an organizer opens it to find who to chase.
	 */
	it('puts the person holding up the round at the top', () => {
		// Alphabetically Ada comes first and owes nothing; Zoe comes last and owes
		// four. If this ever renders in name order the assertion flips.
		const body = withReviewers([reviewer('Ada', 5, 5), reviewer('Zoe', 1, 5)]);

		// Positions of the email, not the name: a two-letter name matches half the
		// markup by accident, and a test that passes for the wrong reason is worse
		// than none.
		expect(body.indexOf('zoe@example.com')).toBeLessThan(body.indexOf('ada@example.com'));
	});

	it('breaks a tie by name so the order does not wobble between loads', () => {
		const body = withReviewers([reviewer('Quinn', 1, 3), reviewer('Perry', 1, 3)]);

		expect(body.indexOf('perry@example.com')).toBeLessThan(body.indexOf('quinn@example.com'));
	});

	it('draws the bar from the same numbers it prints, and prints them', () => {
		const body = withReviewers([reviewer('Ada', 1, 4)]);

		expect(body).toContain('1/4 submitted');
		expect(body).toContain('3 to go');
		// A quarter done. The bar is decoration on top of the sentence, never
		// instead of it — hidden from a screen reader for exactly that reason.
		expect(body).toContain('width: 25%');
		expect(body).toMatch(/aria-hidden="true"[^>]*>\s*<div class="bg-status-good/);
	});
});

/**
 * The four queue cards at the foot of the page. They list talk titles, and the
 * title is the only thing on a row worth reading — but at four columns a card
 * was ~250 px wide, of which the status on the right takes a third, so on a
 * 1280 px screen every line stopped after about twenty characters ("Five
 * minutes on f…"). Two columns and a two-line clamp is the layout decision;
 * these assertions pin it, so a later "let's make it denser" has to argue with
 * a test rather than quietly bring the ellipsis back.
 */
describe('queue cards', () => {
	const longTitle = 'Five minutes on flaky tests and the twenty years of CI that earned them';

	const withQueues = () =>
		render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					dashboard: {
						...emptyDashboard,
						reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] },
						decisions: {
							undecided: 1,
							unreviewed: 1,
							items: [{ id: 11, title: longTitle, reviewsSubmitted: 0, reviewsAssigned: 2 }]
						},
						scheduling: {
							accepted: 1,
							unplaced: 1,
							tentative: 0,
							items: [{ id: 12, title: longTitle, state: 'unplaced' }]
						},
						tasks: {
							open: 1,
							overdue: 0,
							dueSoon: 1,
							items: [
								{
									id: 13,
									title: longTitle,
									speaker: 'Priya Raman',
									dueOn: '2027-03-01',
									overdue: false
								}
							]
						},
						mail: {
							queued: 0,
							sent: 1,
							failed: 0,
							items: [
								{
									id: 14,
									subject: longTitle,
									toEmail: 'priya@example.com',
									status: 'sent',
									error: null
								}
							]
						}
					}
				} as unknown as PageData,
				form: null
			}
		}).body;

	// The queue grid is the last grid on the page; the metric strip above it is
	// allowed its four columns because it holds numbers, not prose.
	const queueGrid = (body: string) => body.slice(body.lastIndexOf('<div class="grid'));

	it('never puts the four title lists in more than two columns', () => {
		const grid = queueGrid(withQueues());

		expect(grid).toContain('md:grid-cols-2');
		expect(grid).not.toContain('grid-cols-4');
	});

	it('gives a long title two lines instead of one ellipsis', () => {
		const grid = queueGrid(withQueues());

		// One clamped title per card, and nothing left cutting a title off after a
		// single line.
		expect(grid.match(/line-clamp-2/g)).toHaveLength(4);
		expect(grid).not.toMatch(/class="[^"]*\btruncate\b[^"]*"[^>]*>\s*Five minutes/);
	});

	it('keeps the whole title reachable on hover even when it is clamped', () => {
		const grid = queueGrid(withQueues());

		expect(grid).toContain(`title="${longTitle}"`);
		expect(grid).toContain(`title="${longTitle} · Priya Raman"`);
	});
});

/**
 * The mail panel (#472). Send queued used to fire on the first click and only
 * reveal an unconfigured transport after the POST. The vendor name answered a
 * question nobody asked.
 */
describe('mail panel', () => {
	function mailPage(opts: { configured: boolean; queued: number; mailMessage?: string }) {
		return render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					mailDeliveryConfigured: opts.configured,
					dashboard: {
						...emptyDashboard,
						reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] },
						mail: { queued: opts.queued, sent: 0, failed: 0, items: [] }
					}
				} as unknown as PageData,
				form: opts.mailMessage ? { mailMessage: opts.mailMessage } : null
			}
		}).body;
	}

	const sendQueued = (body: string) => {
		const at = body.indexOf('data-testid="send-queued"');
		return body.slice(Math.max(0, at - 80), at + 40);
	};

	it('greys the button and names why when delivery is not configured', () => {
		const body = mailPage({ configured: false, queued: 4 });

		expect(body).toContain('data-testid="mail-panel-copy">Mail delivery is not configured.');
		expect(sendQueued(body)).toContain('disabled');
		expect(body).not.toContain('Resend');
	});

	it('greys the button when nothing is queued', () => {
		const body = mailPage({ configured: true, queued: 0 });

		expect(body).toContain('data-testid="mail-panel-copy">Nothing is queued.');
		expect(sendQueued(body)).toContain('disabled');
		expect(body).not.toContain('Resend');
	});

	it('leaves the button live and says when the mail goes out', () => {
		const body = mailPage({ configured: true, queued: 3 });

		expect(body).toContain(
			'data-testid="mail-panel-copy">Queued messages go out when you send them, or with the next dispatch.'
		);
		expect(sendQueued(body)).not.toContain('disabled');
		expect(body).not.toContain('Resend');
	});

	it('shows what the last send actually did', () => {
		const body = mailPage({ configured: true, queued: 0, mailMessage: '3 sent' });

		expect(body).toContain('data-testid="mail-panel-copy">3 sent');
	});
});

/**
 * #473. A brand-new conference used to render the same dashboard drained of
 * numbers. Day one is a different screen; the flip is `dashboardMode`, not a
 * feeling about how empty the tiles look.
 */
describe('day one is a different screen', () => {
	const layout = {
		user: { id: 'organizer-1', name: 'Jordan' },
		speakerProfile: false,
		impersonating: null,
		analytics: { apiKey: undefined, host: undefined },
		conference,
		mailDeliveryConfigured: true
	};

	function renderDash(
		over: Partial<Omit<typeof emptyDashboard, 'mode'>> & { mode?: 'setup' | 'measure' },
		conferenceOver: Partial<typeof conference> = {}
	) {
		return render(Page, {
			props: {
				data: {
					...layout,
					conference: { ...conference, ...conferenceOver },
					dashboard: { ...emptyDashboard, ...over }
				} as PageData,
				form: null
			}
		}).body;
	}

	it('shows the three setup steps when there is nothing to measure', () => {
		const body = renderDash({
			mode: 'setup',
			setup: { rooms: 0, tracks: 0, cfpOpen: false, submissions: 0, speakers: 0 }
		});

		expect(body).toContain('data-testid="dashboard-setup"');
		expect(body).toContain('Set up this event');
		expect(body).toContain('0 rooms');
		expect(body).toContain('0 tracks');
		expect(body).toContain('Closed');
		expect(body).toContain('Add rooms');
		expect(body).not.toContain('data-testid="dashboard-metrics"');
		expect(body).not.toContain('Nothing is waiting on you right now.');
		expect(body).not.toContain('Open the submissions table');
	});

	it('keeps the dashboard once something is waiting', () => {
		const body = renderDash({
			mode: 'measure',
			setup: { rooms: 0, tracks: 0, cfpOpen: false, submissions: 0, speakers: 1 }
		});

		expect(body).toContain('data-testid="dashboard-metrics"');
		expect(body).not.toContain('data-testid="dashboard-setup"');
		expect(body).toContain('Open the submissions table');
	});

	it('names each step from the counts the server sent', () => {
		const body = renderDash({
			mode: 'setup',
			setup: { rooms: 2, tracks: 1, cfpOpen: false, submissions: 0, speakers: 0 }
		});

		expect(body).toContain('2 rooms');
		expect(body).toContain('1 track');
		expect(body).toContain('Open the call');
		expect(body).toContain('Structure is ready');
	});

	it('does not treat missing tracks as the next required step', () => {
		const body = renderDash({
			mode: 'setup',
			setup: { rooms: 2, tracks: 0, cfpOpen: false, submissions: 0, speakers: 0 }
		});

		expect(body).toContain('Structure is ready');
		expect(body).toContain('Open the call');
		expect(body).not.toContain('Rooms are in. Add tracks');
	});

	it('shares the public site, not the editor, when the call is open', () => {
		const body = renderDash({
			mode: 'setup',
			setup: { rooms: 1, tracks: 0, cfpOpen: true, submissions: 0, speakers: 0 }
		});

		expect(body).toContain('Share the call');
		expect(body).toContain('href="/c/test-conf"');
	});

	it('asks to publish when there is no public site to share', () => {
		const body = renderDash(
			{
				mode: 'setup',
				setup: { rooms: 1, tracks: 0, cfpOpen: true, submissions: 0, speakers: 0 }
			},
			{ status: 'draft' }
		);

		expect(body).toContain('Publish the event');
		expect(body).toContain('href="/manage/test-conf/settings"');
		expect(body).not.toContain('href="/c/test-conf"');
	});
});
