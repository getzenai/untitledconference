/**
 * /home is the post-login hub. It used to ship starter chrome ("Where do you
 * want to go?" plus a second Logout) and three static role cards. These pins
 * hold the product hub: events, open work, sourcing jump — and refuse leftovers.
 */
import { roundWindow } from '$lib/conference/round-window';
import type { HomeDashboard } from '$lib/server/conference/home';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const layoutData = {
	user: { id: 'user-1', email: 'jordan@example.test', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined }
};

const emptyHub: HomeDashboard = {
	events: [],
	canCreateEvent: true,
	canSourcing: false,
	openSubmissions: [],
	openTasks: [],
	openReviews: [],
	openReviewCounts: { total: 0, filable: 0 },
	reviewConferences: []
};

function queueHref(html: string) {
	return html.match(/data-testid="home-review-queue-link"[^>]*href="([^"]+)"/)?.[1];
}

function body(
	onboarding: null | {
		pendingInvitationCount: number;
		hasOrganization: boolean;
		href: string;
	},
	hub: typeof emptyHub | null = emptyHub,
	user: typeof layoutData.user = layoutData.user
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(Page, { props: { data: { ...layoutData, user, onboarding, hub } as any } }).body;
}

describe('home hub', () => {
	it('drops starter leftovers and speaks product language', () => {
		const html = body(null);

		expect(html).toContain('data-testid="home-dashboard"');
		expect(html).toContain('Welcome, Jordan');
		expect(html).not.toContain('Welcome, jordan@example.test');
		expect(html).toContain('Your events');
		expect(html).toContain('Create an event');

		expect(html).not.toContain('Where do you want to go?');
		expect(html).not.toMatch(/>\s*Logout\s*</);
		expect(html).not.toContain('Protected Dashboard');
		// Static role cards from the intermediate hub are gone.
		expect(html).not.toMatch(/href="\/manage"/);
		expect(html).not.toContain('>Organizing<');
		expect(html).not.toContain('>Speaking<');
		expect(html).not.toContain('>Reviewing<');
	});

	it('falls back to email when the account has no name (#621)', () => {
		const html = body(null, emptyHub, { ...layoutData.user, name: '' });

		expect(html).toContain('Welcome, jordan@example.test');
		expect(html).not.toContain('Welcome, Jordan');
	});

	it('lists events without forcing a single-conference redirect target', () => {
		const html = body(null, {
			...emptyHub,
			events: [
				{
					id: 1,
					organizationId: 'org-1',
					name: 'DevFlow Summit',
					slug: 'devflow',
					status: 'published',
					startsOn: '2026-09-01',
					endsOn: '2026-09-02',
					venue: 'Berlin',
					createdAt: new Date('2026-01-01'),
					updatedAt: new Date('2026-01-01')
				} as never
			],
			canSourcing: true
		});

		expect(html).toContain('DevFlow Summit');
		expect(html).toContain('href="/manage/devflow/dashboard"');
		expect(html).toContain('All events');
		expect(html).toContain('href="/manage"');
		expect(html).toContain('data-testid="home-new-event"');
		expect(html).toContain('Speaker sourcing');
		expect(html).toContain('data-testid="home-sourcing-link"');
		expect(html).toContain('href="/contacts"');
	});

	it('surfaces open reviews and proposals', () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			// emptyHub arrays are never[]; pin shapes the same way events do above
			openReviews: [
				{
					submissionId: 42,
					title: 'Shipping faster with agents',
					conference: { slug: 'devflow', name: 'DevFlow Summit' }
				} as never
			],
			openSubmissions: [
				{
					id: 7,
					title: 'My draft talk',
					status: 'draft',
					submittedAt: null,
					decidedAt: null,
					isPrimary: true,
					conference: { slug: 'devflow', name: 'DevFlow Summit' }
				} as never
			],
			openTasks: [],
			reviewConferences: []
		});

		expect(html).toContain('Reviews waiting');
		expect(html).toContain('Shipping faster with agents');
		expect(html).toContain('href="/review/devflow/42"');
		// No single conference to name — the queue link stays the list.
		expect(queueHref(html)).toBe('/review');
		expect(html).toContain('Your proposals');
		expect(html).not.toContain('Your tasks');
		expect(html).not.toContain('Your proposals and tasks');
		expect(html).toContain('My draft talk');
		expect(html).toContain('href="/portal/submissions/7"');
	});

	it('sends a reviewer with one conference straight to that queue (#373)', () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			reviewConferences: [
				{
					id: 1,
					organizationId: 'org-1',
					name: 'DevFlow Summit',
					slug: 'devflow',
					status: 'published',
					startsOn: '2026-09-01',
					endsOn: '2026-09-02',
					venue: 'Berlin',
					createdAt: new Date('2026-01-01'),
					updatedAt: new Date('2026-01-01')
				} as never
			]
		});

		expect(queueHref(html)).toBe('/review/devflow');
	});

	it('names the talk on a task row so two confirms at one event are not twins (#243)', () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			openTasks: [
				{
					id: 11,
					submissionId: 7,
					title: 'Confirm participation',
					instructions: null,
					status: 'open',
					dueOn: null,
					conference: { slug: 'devflow', name: 'DevFlow Summit' },
					submissionTitle: 'Serving 70B models on a budget'
				} as never,
				{
					id: 12,
					submissionId: 8,
					title: 'Confirm participation',
					instructions: null,
					status: 'open',
					dueOn: null,
					conference: { slug: 'devflow', name: 'DevFlow Summit' },
					submissionTitle: 'The hallway track is the product'
				} as never,
				{
					id: 13,
					submissionId: null,
					title: 'Upload your headshot',
					instructions: null,
					status: 'open',
					dueOn: null,
					conference: { slug: 'devflow', name: 'DevFlow Summit' },
					submissionTitle: null
				} as never
			]
		});

		expect(html).toContain('Your tasks');
		expect(html).not.toContain('Your proposals');
		expect(html).toContain('DevFlow Summit · Serving 70B models on a budget');
		expect(html).toContain('DevFlow Summit · The hallway track is the product');
		expect(html).toContain('Upload your headshot');
		// Event-wide: conference only, no dangling middle-dot.
		expect(html).not.toContain('DevFlow Summit · Upload');
		expect(html).toContain('href="/portal/tasks/11"');
		expect(html).toContain('href="/portal/tasks/12"');
	});

	it('spaces and dates a deadline the reader can act on (#498)', () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			openTasks: [
				{
					id: 21,
					submissionId: null,
					title: 'Upload your headshot',
					instructions: null,
					status: 'open',
					dueOn: new Date('2027-05-02T21:59:00Z'),
					conference: { slug: 'devflow', name: 'DevFlow Summit' },
					submissionTitle: null
				} as never
			]
		});

		// The block form of this line ate its own leading space — "DevFlow Summit·
		// due 2 May" — and printed a day with no year and no zone.
		expect(html).toContain('DevFlow Summit · due 2 May 2027, 21:59 UTC');
	});

	it("names tasks and proposals as two lists, so a card's kind is visible (#615)", () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			openTasks: [
				{
					id: 31,
					submissionId: 9,
					title: 'Upload final slides',
					instructions: null,
					status: 'open',
					dueOn: null,
					conference: { slug: 'devflow', name: 'DevFlow Conf 2027' },
					submissionTitle: 'Notes towards a talk on batching'
				} as never
			],
			openSubmissions: [
				{
					id: 9,
					title: 'Notes towards a talk on batching',
					status: 'draft',
					submittedAt: null,
					decidedAt: null,
					isPrimary: true,
					conference: { slug: 'devflow', name: 'DevFlow Conf 2027' }
				} as never,
				{
					id: 10,
					title: 'What we got wrong about long context',
					status: 'submitted',
					submittedAt: new Date('2026-03-02'),
					decidedAt: null,
					isPrimary: true,
					conference: { slug: 'devflow', name: 'DevFlow Conf 2027' }
				} as never
			]
		});

		// Two headings, in this order, with the cards under the heading that
		// names their kind. One "Your proposals" over a mixed list was the bug.
		expect(html).toContain('Your tasks');
		expect(html).toContain('Your proposals');
		expect(html).not.toContain('Your proposals and tasks');
		expect(html.indexOf('Your tasks')).toBeLessThan(html.indexOf('Upload final slides'));
		expect(html.indexOf('Upload final slides')).toBeLessThan(html.indexOf('Your proposals'));
		expect(html.indexOf('Your proposals')).toBeLessThan(
			html.indexOf('What we got wrong about long context')
		);
	});

	it('surfaces unfinished onboarding without burying the hub', () => {
		const html = body(
			{
				pendingInvitationCount: 2,
				hasOrganization: false,
				href: '/onboarding/invitations'
			},
			{ ...emptyHub, canCreateEvent: false }
		);

		expect(html).toContain('pending invitation');
		expect(html).toContain('/onboarding/invitations');
		expect(html).toContain('Review invitations');
		expect(html).toContain('Your events');
	});
});

/**
 * #465: a reviewer with 22 outstanding reviews met a dashed card offering to
 * create an organization — the only styled action on the page — while the work
 * that is actually theirs started below the fold and showed six of twenty-two
 * with no denominator.
 */
describe('a page that belongs to the reviewer', () => {
	const openReview = (id: number, title: string) =>
		({
			submissionId: id,
			title,
			conference: { slug: 'devflow', name: 'DevFlow Summit' },
			window: roundWindow(null, null),
			reviewsFiled: 0
		}) as never;

	const reviewerHub = {
		...emptyHub,
		canCreateEvent: false,
		openReviews: [openReview(1, 'First talk'), openReview(2, 'Second talk')],
		openReviewCounts: { total: 22, filable: 9 }
	};

	it('puts the reviews above the events prompt when there are no events', () => {
		const html = body(null, reviewerHub);

		expect(html.indexOf('Reviews waiting')).toBeLessThan(html.indexOf('Your events'));
	});

	it('offers the organization as a sentence, not as the loudest thing on screen', () => {
		const html = body(null, reviewerHub);

		expect(html).toContain('data-testid="home-no-events-aside"');
		// The link survives; the call to action does not.
		expect(html).toContain('href="/settings/organization/new"');
		expect(html).not.toContain('Create an organization</a>');
	});

	it('says what the short list is a sample of, and what can be filed today', () => {
		const html = body(null, reviewerHub);

		expect(html).toContain('2 of 22 assigned to you');
		expect(html).toContain('9 you can file now');
	});

	it('does not claim a sample when the list is everything', () => {
		const html = body(null, {
			...reviewerHub,
			openReviewCounts: { total: 2, filable: 0 }
		});

		expect(html).toContain('2 assigned to you');
		expect(html).not.toContain('of 2 assigned');
		expect(html).toContain('nothing you can file today');
	});

	it('leaves the organizer page in the order an organizer expects', () => {
		const html = body(null, { ...emptyHub, canCreateEvent: true });

		expect(html.indexOf('Your events')).toBeLessThan(
			html.indexOf('Reviews waiting') === -1 ? Infinity : html.indexOf('Reviews waiting')
		);
		expect(html).not.toContain('data-testid="home-no-events-aside"');
	});
});

/**
 * #662: a speaker with a task and proposals met the same dashed card as the
 * reviewer in #465 — *No events yet / Create an organization* — while the
 * work that is actually theirs started below it. `#465` only swapped on
 * `openReviews`.
 */
describe('a page that belongs to the speaker', () => {
	const speakerHub = {
		...emptyHub,
		canCreateEvent: false,
		openTasks: [
			{
				id: 41,
				submissionId: 13,
				title: 'Sign speaker release form',
				instructions: null,
				status: 'open',
				dueOn: null,
				conference: { slug: 'devflow', name: 'DevFlow Conf 2027' },
				submissionTitle: 'Walk check: when the queue is the product'
			} as never
		],
		openSubmissions: [
			{
				id: 13,
				title: 'Walk check: when the queue is the product',
				status: 'submitted',
				submittedAt: new Date('2026-08-15'),
				decidedAt: null,
				isPrimary: true,
				conference: { slug: 'devflow', name: 'DevFlow Conf 2027' }
			} as never,
			{
				id: 14,
				title: 'A hallway is not a hallway',
				status: 'draft',
				submittedAt: null,
				decidedAt: null,
				isPrimary: true,
				conference: { slug: 'devflow', name: 'DevFlow Conf 2027' }
			} as never
		]
	};

	it('puts tasks and proposals above the events prompt when there are no events', () => {
		const html = body(null, speakerHub);

		expect(html.indexOf('Your tasks')).toBeLessThan(html.indexOf('Your events'));
		expect(html.indexOf('Your proposals')).toBeLessThan(html.indexOf('Your events'));
	});

	it('offers the organization as a sentence, not as the loudest thing on screen', () => {
		const html = body(null, speakerHub);

		expect(html).toContain('data-testid="home-no-events-aside"');
		expect(html).toContain('href="/settings/organization/new"');
		expect(html).not.toContain('Create an organization</a>');
	});

	it('still puts reviews above speaker work when both are waiting', () => {
		const html = body(null, {
			...speakerHub,
			openReviews: [
				{
					submissionId: 99,
					title: 'Someone else is shipping',
					conference: { slug: 'devflow', name: 'DevFlow Conf 2027' },
					window: roundWindow(null, null),
					reviewsFiled: 0
				} as never
			],
			openReviewCounts: { total: 1, filable: 1 }
		});

		expect(html.indexOf('Reviews waiting')).toBeLessThan(html.indexOf('Your tasks'));
		expect(html.indexOf('Your tasks')).toBeLessThan(html.indexOf('Your events'));
	});

	it('leaves Create an organization for someone with neither work nor events', () => {
		const html = body(null, { ...emptyHub, canCreateEvent: false });

		expect(html).toContain('Create an organization</a>');
		expect(html).not.toContain('data-testid="home-no-events-aside"');
		expect(html).not.toContain('Your tasks');
		expect(html).not.toContain('Your proposals');
	});
});

/**
 * #473. New event was a grey caption under the list. Speaker sourcing was the
 * only styled button, and it duplicated the card below. The thing someone came
 * here to do is the header action.
 */
describe('New event is an action', () => {
	it('puts New event on a button, not on a caption', () => {
		const html = body(null, {
			...emptyHub,
			events: [
				{
					id: 1,
					organizationId: 'org-1',
					name: 'DevFlow Summit',
					slug: 'devflow',
					status: 'published',
					startsOn: '2026-09-01',
					endsOn: '2026-09-02',
					venue: 'Berlin',
					createdAt: new Date('2026-01-01'),
					updatedAt: new Date('2026-01-01')
				} as never
			],
			canSourcing: true
		});

		expect(html).toContain('data-testid="home-new-event"');
		expect(html).toContain('href="/manage/new"');
		// The yellow create variant, not the muted caption that used to sit under
		// the list. `bg-act` is how this product marks "this starts something".
		const action = html.slice(html.indexOf('data-testid="home-new-event"') - 120);
		expect(action).toContain('bg-act');
		expect(html).not.toMatch(/text-muted-foreground[^"]*text-xs[^"]*">\s*New event/);
	});

	it('does not offer New event to someone who cannot create one', () => {
		const html = body(null, { ...emptyHub, canCreateEvent: false });

		expect(html).not.toContain('data-testid="home-new-event"');
	});
});
