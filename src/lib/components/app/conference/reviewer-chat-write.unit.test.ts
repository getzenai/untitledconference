import { describe, expect, it } from 'vitest';
import { describeReviewWrite, previewReviewWrite, reviewWriteError } from './reviewer-chat-write';

describe('reviewer chat write copy (#302)', () => {
	const input = { submissionId: 42, answers: { '7': '4' }, comment: 'Clear fit.' };

	it('names the talk and the score before they confirm', () => {
		expect(previewReviewWrite(input, 'Observability for agents', 'Final')).toBe(
			'This will file a review of Observability for agents in Final (scores 4; comment: Clear fit.).'
		);
	});

	it('names the change after a confirmed write', () => {
		expect(describeReviewWrite(input, 'Observability for agents', 'Final')).toBe(
			'Saved review of Observability for agents in Final: 4'
		);
		expect(describeReviewWrite({ submissionId: 42 })).toBe('Saved review of submission 42');
	});
});

describe('reviewWriteError (#302)', () => {
	it('reads the refusal off a finished call', () => {
		expect(reviewWriteError({ error: 'This talk is still a draft.' })).toBe(
			'This talk is still a draft.'
		);
	});

	it('is null for a real write, and for anything that is not a refusal', () => {
		expect(reviewWriteError({ submissionId: 42, submitted: true })).toBeNull();
		expect(reviewWriteError({ error: '  ' })).toBeNull();
		expect(reviewWriteError({ error: 7 })).toBeNull();
		expect(reviewWriteError(null)).toBeNull();
		expect(reviewWriteError('error')).toBeNull();
	});
});
