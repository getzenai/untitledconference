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
				queue: []
			},
			form: null
		} as never
	}).body;

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
