import { describe, expect, it } from 'vitest';
import { describeReviewWrite, previewReviewWrite } from './reviewer-chat-write';

describe('reviewer chat write copy (#302)', () => {
	const input = { submissionId: 42, answers: { '7': '4' }, comment: 'Clear fit.' };

	it('names the talk and the score before they confirm', () => {
		expect(previewReviewWrite(input, 'Observability for agents')).toBe(
			'This will file a review of Observability for agents (scores 4; comment: Clear fit.).'
		);
	});

	it('names the change after a confirmed write', () => {
		expect(describeReviewWrite(input, 'Observability for agents')).toBe(
			'Saved review of Observability for agents: 4'
		);
		expect(describeReviewWrite({ submissionId: 42 })).toBe('Saved review of submission 42');
	});
});
