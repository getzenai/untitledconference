/** The sentences a speaker reads before withdrawing (#495). */
import { describe, expect, it } from 'vitest';
import { withdrawWarning } from './withdraw-warning';

describe('withdrawWarning', () => {
	it('names the conference in the question', () => {
		expect(withdrawWarning('DevFlow Conf 2027', 1).title).toBe(
			'Tell DevFlow Conf 2027 you cannot take part?'
		);
	});

	it('counts the talks, because the answer covers the whole event', () => {
		// The number is the difference between two decisions, so it is not a
		// detail the sentence can round off to "your talks".
		expect(withdrawWarning('DevFlow Conf 2027', 2).consequence).toBe(
			'The organizers will be told to drop all 2 of your accepted talks at DevFlow Conf 2027 from the programme.'
		);
		expect(withdrawWarning('DevFlow Conf 2027', 1).consequence).toBe(
			'The organizers will be told to drop your accepted talk at DevFlow Conf 2027 from the programme.'
		);
	});

	/**
	 * A speaker whose acceptance has not been recorded as a submission of theirs
	 * still gets a sentence that reads: singular is the floor, never "0 talks".
	 */
	it('never says zero', () => {
		expect(withdrawWarning('DevFlow Conf 2027', 0).consequence).toContain('your accepted talk');
	});

	it('says it can be taken back, and what that still costs', () => {
		expect(withdrawWarning('DevFlow Conf 2027', 1).reversal).toContain('change your mind');
		expect(withdrawWarning('DevFlow Conf 2027', 1).reversal).toContain('filled your slot');
	});
});
