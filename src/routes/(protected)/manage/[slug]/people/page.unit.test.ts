/**
 * Reviewer visibility belongs with the committee (#63), not conference structure —
 * and so does the committee itself, which is what makes the visibility mean
 * anything.
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

const draw = (
	committee: {
		membershipId: number;
		userId: string;
		name: string;
		email: string;
		role: 'reviewer';
		conferenceManaged: boolean;
		rounds: string[];
		trackIds: number[];
		tracks: string[];
		assigned: number;
		submitted: number;
		outstanding: number;
	}[],
	pendingInvitations: { id: string; email: string; expiresAt: Date }[] = []
) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				committee,
				tracks: [
					{ id: 3, name: 'Platform' },
					{ id: 4, name: 'Security' }
				],
				pendingInvitations
			} as never,
			form: null
		}
	}).body;

describe('team & reviewers page', () => {
	it('hosts review visibility and not room/track/format forms', () => {
		const body = draw([]);

		expect(body).toContain('data-testid="people-review-visibility"');
		expect(body).toContain('What reviewers see of each other');
		expect(body).toContain('before they file their own');
		expect(body).toContain('draft is not filed');
		expect(body).not.toContain('page is built');
		expect(body).not.toContain('never sent to the browser');
		expect(body).toContain('action="?/reviewVisibility"');
		expect(body).not.toContain('action="?/addRoom"');
		expect(body).not.toContain('Session formats');
	});

	it('offers a way to add a reviewer, and says plainly when there are none', () => {
		const body = draw([]);

		expect(body).toContain('data-testid="people-committee"');
		expect(body).toContain('action="?/addReviewer"');
		expect(body).toContain('Add or invite');
		// The empty state has to name the consequence, because an organizer who does
		// not fill this in gets an assignment panel that silently offers nobody.
		expect(body).toContain('submissions cannot be assigned');
	});

	it('lists the committee with a way to remove each member', () => {
		const body = draw([
			{
				membershipId: 7,
				userId: 'user-rex',
				name: 'Rex Reviewer',
				email: 'rex@example.com',
				role: 'reviewer',
				conferenceManaged: true,
				rounds: [],
				trackIds: [3],
				tracks: ['Platform'],
				assigned: 4,
				submitted: 2,
				outstanding: 2
			}
		]);

		expect(body).toContain('Rex Reviewer');
		expect(body).toContain('rex@example.com');
		expect(body).toContain('action="?/removeReviewer"');
		expect(body).toContain('value="7"');
		expect(body).toContain('2/4 submitted');
		expect(body).toContain('action="?/updateTracks"');
		expect(body).toContain('Only selected tracks');
		expect(body).not.toContain('submissions cannot be assigned');
	});

	it('shows round-scoped reviewers once without conference-only controls', () => {
		const body = draw([
			{
				membershipId: 8,
				userId: 'user-ines',
				name: 'Ines Reviewer',
				email: 'ines@example.com',
				role: 'reviewer',
				conferenceManaged: false,
				rounds: ['Screening', 'Final'],
				trackIds: [],
				tracks: [],
				assigned: 1,
				submitted: 0,
				outstanding: 1
			}
		]);

		expect(body).toContain('Round reviewer · Screening, Final');
		expect(body).toContain('access is managed by their review rounds');
		expect(body).not.toContain('action="?/removeReviewer"');
		expect(body).not.toContain('action="?/updateTracks"');
	});

	it('shows pending reviewer invitations with the reusable acceptance link', () => {
		const body = draw(
			[],
			[{ id: 'invite-123', email: 'new@example.com', expiresAt: new Date('2027-02-01') }]
		);

		expect(body).toContain('data-testid="pending-reviewer-invitations"');
		expect(body).toContain('new@example.com');
		expect(body).toContain('href="/invite/invite-123"');
	});
});
