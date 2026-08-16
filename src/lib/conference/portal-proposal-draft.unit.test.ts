import { describe, expect, it } from 'vitest';
import {
	parsePortalProposalDraft,
	portalProposalBaseline,
	portalProposalDraftScope,
	sameProposalDraft
} from './portal-proposal-draft';
import { emptyProposal, type ProposalDraft } from './proposal-draft';

const saved: ProposalDraft = {
	...emptyProposal(),
	title: 'Queues are product decisions',
	abstract: 'The stored abstract.',
	keyTakeaway: 'A point',
	audienceLevel: 'Beginner',
	sessionFormatId: 3,
	trackId: 8,
	answers: { 2: 'beta', 1: 'alpha' },
	speaker: {
		name: 'Priya Raman',
		sortName: 'Raman, Priya',
		email: 'priya@example.test',
		jobTitle: 'Engineer',
		company: 'DevFlow',
		bio: 'Builds queues.'
	},
	coSpeakers: [{ name: 'Sam Lee', email: 'sam@example.test', roleLabel: 'Co-presenter' }]
};

describe('portal proposal draft helpers', () => {
	it('names the draft by the submission, not by the current path', () => {
		expect(portalProposalDraftScope(30)).toBe('portal-proposal:30');
	});

	it('treats answer-key order as identity, not as a different draft', () => {
		const swapped: ProposalDraft = {
			...saved,
			answers: { 1: 'alpha', 2: 'beta' }
		};
		expect(sameProposalDraft(saved, swapped)).toBe(true);
		expect(portalProposalBaseline(saved)).toBe(portalProposalBaseline(swapped));
	});

	it('treats speaker-field order as identity, not as a different draft', () => {
		const reorderedSpeaker = {
			...saved,
			speaker: {
				bio: saved.speaker.bio,
				company: saved.speaker.company,
				jobTitle: saved.speaker.jobTitle,
				email: saved.speaker.email,
				sortName: saved.speaker.sortName,
				name: saved.speaker.name
			}
		};
		expect(sameProposalDraft(saved, reorderedSpeaker)).toBe(true);
		expect(portalProposalBaseline(saved)).toBe(portalProposalBaseline(reorderedSpeaker));
	});

	it('sees a changed abstract as a different draft', () => {
		expect(sameProposalDraft(saved, { ...saved, abstract: 'Rewritten.' })).toBe(false);
	});

	it('rejects a payload that is not a proposal draft', () => {
		expect(parsePortalProposalDraft(null)).toBeNull();
		expect(parsePortalProposalDraft({ title: 'only' })).toBeNull();
		expect(parsePortalProposalDraft(saved)).toEqual(saved);
	});

	it('keeps answer values after a parse, regardless of key order in the payload', () => {
		const parsed = parsePortalProposalDraft({
			...saved,
			answers: { 2: 'beta', 1: 'alpha' }
		});
		expect(parsed).not.toBeNull();
		expect(sameProposalDraft(parsed!, saved)).toBe(true);
	});
});
