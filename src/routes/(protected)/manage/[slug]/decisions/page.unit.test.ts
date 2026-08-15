/**
 * What the room is told about sponsor holds (#450).
 *
 * The arithmetic on this screen is the argument that wins most acceptance calls, so
 * the rule is the same one the counter obeys: state what we know, invent nothing. A
 * held slot is not capacity we may spend and not capacity we may quietly deduct.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = { id: 1, name: 'Test Conf', slug: 'test-conf' };

const renderWith = (sponsorHolds: number, capacity: number | null = null) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				board: {
					total: { id: null, name: 'Test Conf', capacity, accepted: 12 },
					tracks: [],
					untracked: 0,
					sponsorHolds
				},
				seats: [],
				selectedUserId: null,
				queue: [],
				organizers: []
			},
			form: null
		} as never
	}).body;

describe('empty state before anyone ranks (#555)', () => {
	it('names the room and points at Submissions, instead of a row list', () => {
		const body = renderWith(0);

		expect(body).toContain('data-testid="slot-board"');
		expect(body).toContain('data-testid="decisions-empty"');
		expect(body).toContain('No reviewer has ranked yet');
		expect(body).toContain('The pile is on Submissions');
		expect(body).toContain('href="/manage/test-conf/submissions"');
		expect(body).toContain('Open Submissions');
		expect(body).not.toContain('data-testid="lobbying-queue"');
		expect(body).not.toContain('data-testid="committee-tabs"');
	});

	it('does not show the empty state once a member has a ranking', () => {
		const body = renderQueue(null);

		expect(body).not.toContain('data-testid="decisions-empty"');
		expect(body).toContain('data-testid="committee-tabs"');
		expect(body).toContain('data-testid="lobbying-queue"');
	});
});

describe('sponsor holds on the decision screen', () => {
	it('says nothing when no slot is held', () => {
		expect(renderWith(0)).not.toContain('data-testid="slot-sponsor-holds"');
	});

	it('names the held slots and points at where they are released', () => {
		const body = renderWith(4);

		expect(body).toContain('data-testid="slot-sponsor-holds"');
		expect(body).toContain('4 sponsor');
		expect(body).toContain('/manage/test-conf/agenda');
	});

	/** One hold is one sentence, not "1 slots are held with no talk in them". */
	it('reads as English for a single hold', () => {
		const body = renderWith(1);

		expect(body).toContain('1 sponsor');
		expect(body).toContain('slot is');
		expect(body).not.toContain('slots are');
	});

	/**
	 * The line the whole issue turns on: holds are stated next to the remainder,
	 * never subtracted from it. Nobody told us whether the typed 51 already had the
	 * sponsor slots in it, and guessing is how a screen says "18 left" where it is 12.
	 */
	it('leaves the remainder alone', () => {
		const body = renderWith(4, 20);

		expect(body).toContain('8 left');
		expect(body).toContain('12 accepted, 8 left of 20');
	});
});

const renderQueue = (sponsorTier: string | null) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				board: {
					total: { id: null, name: 'Test Conf', capacity: null, accepted: 0 },
					tracks: [],
					untracked: 0,
					sponsorHolds: 0
				},
				seats: [{ userId: 'ada', name: 'Ada', queueLength: 1 }],
				selectedUserId: 'ada',
				organizers: [{ userId: 'organizer-1', name: 'Jordan' }],
				queue: [
					{
						submissionId: 11,
						title: 'A sponsored talk',
						track: null,
						trackId: null,
						status: 'submitted',
						myScore: 4,
						overallScore: 4,
						reviewsSubmitted: 1,
						myComment: null,
						sponsorTier,
						acceptCondition: null,
						acceptConditionOwner: null,
						resubmitGuidance: null,
						declineNote: null
					}
				]
			},
			form: null
		} as never
	}).body;

describe('sponsor affiliation on the decision list', () => {
	it('names a sponsor talk on the row, without opening it', () => {
		const body = renderQueue('Gold');

		expect(body).toContain('A sponsored talk');
		expect(body).toContain('data-testid="queue-sponsor"');
		expect(body).toContain('Gold · internal');
	});

	it('says nothing when the talk is not a sponsor talk', () => {
		expect(renderQueue(null)).not.toContain('data-testid="queue-sponsor"');
	});
});

describe('conditional accept on the decision list', () => {
	it('names the note on the row, without opening the talk (#445)', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					board: {
						total: { id: null, name: 'Test Conf', capacity: null, accepted: 1 },
						tracks: [],
						untracked: 0,
						sponsorHolds: 0
					},
					seats: [{ userId: 'ada', name: 'Ada', queueLength: 1 }],
					selectedUserId: 'ada',
					organizers: [{ userId: 'organizer-1', name: 'Jordan' }],
					queue: [
						{
							submissionId: 11,
							title: 'A conditional talk',
							track: null,
							trackId: null,
							status: 'accepted',
							myScore: 4,
							overallScore: 4,
							reviewsSubmitted: 1,
							myComment: null,
							sponsorTier: null,
							acceptCondition: 'bring a co-presenter',
							acceptConditionOwner: 'Ann Follows',
							resubmitGuidance: null,
							declineNote: null
						}
					]
				},
				form: null
			} as never
		}).body;

		expect(body).toContain('data-testid="queue-condition"');
		expect(body).toContain('bring a co-presenter · Ann Follows');
		expect(body).not.toContain('data-testid="accept-condition"');
	});
});
