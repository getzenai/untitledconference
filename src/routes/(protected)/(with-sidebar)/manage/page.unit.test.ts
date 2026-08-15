/**
 * "My conferences" has to keep offering the way to start another one.
 *
 * This page used to redirect straight into the conference when there was
 * exactly one — which is the state an organizer is in immediately after making
 * their first. Everything living on this page, the create entry point included,
 * became unreachable at that moment. The redirect is gone; these tests hold the
 * button in place for the state that hid it.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

const conference = (
	id: number,
	slug: string,
	predecessor: { id: number; name: string; slug: string } | null = null,
	predecessorOptions: { id: number; name: string; slug: string }[] = []
) => ({
	id,
	organizationId: 'org-test',
	name: `Conference ${id}`,
	slug,
	status: 'draft' as const,
	venue: null,
	startsOn: '2028-05-12',
	endsOn: '2028-05-14',
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	predecessorConferenceId: predecessor?.id ?? null,
	predecessor,
	predecessorOptions,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
});

/** The layout fields the page's `data` type carries but this page never reads. */
const layoutData = {
	user: { id: 'owner-1', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined }
};

function body(conferences: ReturnType<typeof conference>[], canCreate: boolean) {
	return render(Page, {
		props: {
			data: { ...layoutData, conferences, canCreate } as PageData,
			form: null
		}
	}).body;
}

describe('my conferences', () => {
	it('offers a way to start another one when the owner already has exactly one', () => {
		// The regression this file exists for.
		const html = body([conference(1, 'devflow-2028')], true);

		expect(html).toContain('/manage/new');
		expect(html).toContain('New conference');
		// The one they have is still listed, and the door is the dashboard (#411).
		expect(html).toContain('/manage/devflow-2028/dashboard');
	});

	it('opens a conference on its dashboard, not in the submissions table', () => {
		// #411: `/home` and this list disagreed about the front door. The dashboard
		// is the overview an organizer expects; the table is one destination in it.
		const html = body([conference(1, 'devflow-2028')], true);

		expect(html).toContain('/manage/devflow-2028/dashboard');
		expect(html).not.toContain('/manage/devflow-2028/submissions');
	});

	it('offers the create step to an owner with none yet', () => {
		const html = body([], true);

		expect(html).toContain('/manage/new');
		expect(html).toContain('Create a conference');
	});

	it('sends someone with no organization to that step first', () => {
		const html = body([], false);

		expect(html).toContain('/settings/organization/new');
		// No point offering a conference to somebody who has nowhere to put it.
		expect(html).not.toContain('/manage/new');
	});

	it('hides the create entry from a member who may not use it', () => {
		// A scoped conference organizer sees their events, but creating one is an
		// org-wide right — an offer they cannot accept is worse than no offer.
		const html = body([conference(1, 'devflow-2028'), conference(2, 'other-2028')], false);

		expect(html).toContain('/manage/devflow-2028/dashboard');
		expect(html).not.toContain('/manage/new');
	});

	it('names the previous edition on the list', () => {
		// #448: the relationship is the fact this page has to show. Transferring
		// talks comes later; the sentence is the whole visible product for now.
		const previous = { id: 2, name: 'DevFlow 2027', slug: 'devflow-2027' };
		const html = body([conference(1, 'devflow-2028', previous, [previous])], true);

		expect(html).toContain('data-testid="predecessor-line"');
		expect(html).toContain('Follows DevFlow 2027');
		expect(html).toContain('data-testid="predecessor-select"');
	});

	it('does not invent a previous edition when none is named', () => {
		const html = body([conference(1, 'devflow-2028')], true);

		expect(html).not.toContain('data-testid="predecessor-line"');
		expect(html).not.toContain('Follows ');
	});
});
