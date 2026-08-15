import { describe, expect, it } from 'vitest';
import {
	assignedReviewers,
	chipOverflow,
	reviewerTitle,
	VISIBLE_CHIPS,
	type ReviewSeat
} from './assigned-reviewers';

const seat = (over: Partial<ReviewSeat> = {}): ReviewSeat => ({
	userId: 'u1',
	name: 'Ada Lovelace',
	email: 'ada@example.com',
	round: 'Round 1',
	submitted: false,
	...over
});

describe('assignedReviewers', () => {
	it('gives one chip per person, whatever the seat count', () => {
		const reviewers = assignedReviewers([
			seat({ round: 'Round 1' }),
			seat({ round: 'Round 2' }),
			seat({ userId: 'u2', name: 'Grace Hopper', email: 'grace@example.com' })
		]);

		expect(reviewers).toHaveLength(2);
		expect(reviewers[0]).toMatchObject({
			label: 'Ada Lovelace',
			initials: 'AL',
			rounds: ['Round 1', 'Round 2']
		});
		expect(reviewers[1].initials).toBe('GH');
	});

	it('keeps the order the seats arrived in', () => {
		const reviewers = assignedReviewers([
			seat({ userId: 'u2', name: 'Grace Hopper' }),
			seat({ userId: 'u1', name: 'Ada Lovelace' })
		]);

		expect(reviewers.map((r) => r.userId)).toEqual(['u2', 'u1']);
	});

	it('counts a person as outstanding while any of their seats is open', () => {
		const [ada] = assignedReviewers([
			seat({ round: 'Round 1', submitted: true }),
			seat({ round: 'Round 2', submitted: false })
		]);

		expect(ada.outstanding).toBe(true);
	});

	it('clears the flag only when every seat is in', () => {
		const [ada] = assignedReviewers([
			seat({ round: 'Round 1', submitted: true }),
			seat({ round: 'Round 2', submitted: true })
		]);

		expect(ada.outstanding).toBe(false);
	});

	it('falls back to the email when the account has no name', () => {
		const [only] = assignedReviewers([seat({ name: null, email: 'ada@example.com' })]);

		expect(only.label).toBe('ada@example.com');
		// An empty chip reads as a rendering fault, so something always shows.
		expect(only.initials).toBe('A');
	});

	it('treats a blank name as no name at all', () => {
		const [only] = assignedReviewers([seat({ name: '   ' })]);

		expect(only.label).toBe('ada@example.com');
	});

	it('has nothing to say about a talk nobody is on', () => {
		expect(assignedReviewers([])).toEqual([]);
	});
});

describe('reviewerTitle', () => {
	it('names the rounds and says the state in words', () => {
		const [ada] = assignedReviewers([
			seat({ round: 'Screening', submitted: true }),
			seat({ round: 'Final', submitted: false })
		]);

		expect(reviewerTitle(ada)).toBe('Ada Lovelace · Screening, Final · not handed in');
	});

	it('says handed in once every seat is', () => {
		const [ada] = assignedReviewers([seat({ round: 'Screening', submitted: true })]);

		expect(reviewerTitle(ada)).toBe('Ada Lovelace · Screening · handed in');
	});
});

describe('chipOverflow', () => {
	const many = (n: number) =>
		assignedReviewers(
			Array.from({ length: n }, (_, i) =>
				seat({ userId: `u${i}`, name: `Reviewer ${i}`, email: `r${i}@example.com` })
			)
		);

	it('shows everyone when they fit', () => {
		const { shown, hidden } = chipOverflow(many(VISIBLE_CHIPS));

		expect(shown).toHaveLength(VISIBLE_CHIPS);
		expect(hidden).toEqual([]);
	});

	it('holds the rest back once they do not', () => {
		const { shown, hidden } = chipOverflow(many(VISIBLE_CHIPS + 2));

		expect(shown).toHaveLength(VISIBLE_CHIPS);
		expect(hidden).toHaveLength(2);
	});
});
