/**
 * Pipeline board surface (CRM-07 / CRM-08).
 */
import { PIPELINE_STAGES } from '$lib/conference/pipeline-stages';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const card = {
	id: 9,
	organizationId: 'org-1',
	speakerProfileId: 5,
	stage: 'contacted' as const,
	notes: 'Left voicemail',
	score: 85,
	rationale: 'Strong track',
	name: 'Marcus Okafor',
	email: 'marcus@example.com',
	company: 'Platform Co',
	jobTitle: 'Staff Engineer',
	updatedAt: new Date('2027-01-15T12:00:00Z')
};

const emptyBoard = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []]));

const baseData = {
	user: { id: 'organizer-1', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined },
	canManage: true,
	board: { ...emptyBoard, contacted: [card] },
	stages: [...PIPELINE_STAGES],
	enrollable: [{ id: 3, name: 'Priya Raman', email: 'priya@example.com', company: 'Acme' }],
	selected: {
		...card,
		history: [
			{
				id: 2,
				fromStage: 'identified' as const,
				toStage: 'contacted' as const,
				changedAt: new Date('2027-01-15T11:00:00Z')
			},
			{
				id: 1,
				fromStage: null,
				toStage: 'identified' as const,
				changedAt: new Date('2027-01-14T10:00:00Z')
			}
		]
	}
};

describe('pipeline page', () => {
	it('renders named stage columns and a card in its stage (CRM-07)', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="pipeline-heading"');
		expect(body).toContain('data-testid="pipeline-board"');
		expect(body).toContain('data-testid="pipeline-enroll"');
		expect(body).toContain('They show up on this board');
		expect(body).not.toContain('duplicate profile');
		expect(body).toContain('Researching');
		expect(body).toContain('Identified');
		expect(body).toContain('Contacted');
		expect(body).toContain('Interested');
		expect(body).toContain('Confirmed');
		expect(body).toContain('Declined');
		expect(body).toContain('Marcus Okafor');
		expect(body).toContain('data-stage="contacted"');
		expect(body).toContain('/contacts/pipeline?card=9');
	});

	it('renders card detail with notes and timestamped stage history (CRM-08)', () => {
		const { body } = render(Page, {
			props: { data: baseData as never, form: null }
		});

		expect(body).toContain('data-testid="pipeline-card-detail"');
		expect(body).toContain('data-testid="pipeline-notes"');
		expect(body).toContain('Left voicemail');
		expect(body).toContain('data-testid="pipeline-stage-history"');
		expect(body).toContain('Identified');
		expect(body).toContain('Contacted');
		expect(body).toContain('data-testid="pipeline-history-stamp"');
		expect(body).toContain('data-testid="pipeline-move-form"');
	});
});
