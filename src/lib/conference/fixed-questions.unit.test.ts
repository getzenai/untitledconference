/**
 * The list against the form, not against a copy of itself.
 *
 * `FIXED_QUESTION_GROUPS` is a description of `proposal-form.svelte`, and a
 * description drifts: someone adds a field to the form, the builder keeps
 * listing the old set, and the screen quietly lies again — which is the exact
 * bug this feature was built to fix. So the test reads the component's source
 * and compares the `name` attributes it really posts.
 *
 * Reading a source file from a test is unusual and deliberate. Rendering the
 * component would need conference data, a form store and a submitter session to
 * answer a question that is purely about markup, and any of that could go wrong
 * in a way that reads as "the list is fine".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	asks,
	FIXED_QUESTION_GROUPS,
	FIXED_QUESTION_NAMES,
	FIXED_QUESTIONS,
	fixedQuestionVisibility,
	isRemovable,
	parseHiddenFixedKeys,
	REMOVABLE_FIXED_KEYS,
	serializeHiddenFixedKeys
} from './fixed-questions';

const source = readFileSync(
	fileURLToPath(new URL('../components/app/conference/proposal-form.svelte', import.meta.url)),
	'utf8'
);

/**
 * Every `name=` in the submitter's form, minus the configurable answers.
 *
 * `answer:{field.id}` is the one dynamic name in the file — it is what the
 * organizer's own fields post, and those are precisely not fixed.
 */
const posted = new Set(
	[...source.matchAll(/name="([^"{]+)"/g)]
		.map((match) => match[1])
		.filter((name) => !name.startsWith('answer:'))
);

describe('the fixed questions', () => {
	it('names exactly the controls the proposal form posts', () => {
		expect([...posted].sort()).toEqual([...FIXED_QUESTION_NAMES].sort());
	});

	// A sanity check on the reader itself: if the regex ever stopped matching,
	// both sides would be empty and the test above would pass on nothing.
	it('found the form and read something out of it', () => {
		expect(posted.size).toBeGreaterThan(10);
		expect(posted.has('title')).toBe(true);
	});

	it('lists no name twice, so the builder cannot show one question twice', () => {
		expect(new Set(FIXED_QUESTION_NAMES).size).toBe(FIXED_QUESTION_NAMES.length);
	});

	it('marks the two the form refuses to be submitted without', () => {
		const required = FIXED_QUESTION_GROUPS.flatMap((g) => g.questions)
			.filter((q) => q.required)
			.map((q) => q.label);

		// Server-side validation is the authority here (`saveProposal` rejects an
		// empty title, abstract, speaker name or email); the list has to agree with
		// it or the builder promises less than the form demands.
		expect(required).toEqual(['Title', 'Abstract', 'Name', 'Email']);
	});
});

/**
 * The stored side of #159.
 *
 * What is written down is which questions a call does NOT ask, so the default —
 * every conference that existed before the feature, and every one created since
 * without touching it — is the whole form. These pin that direction, because
 * getting it backwards would empty every existing call's form on deploy and
 * nothing else in the suite would notice until a submitter did.
 */
describe('which fixed questions a call asks', () => {
	it('asks all of them when nothing is stored', () => {
		for (const stored of [null, undefined, '', '[]']) {
			const visibility = fixedQuestionVisibility(stored);
			for (const question of FIXED_QUESTIONS) expect(asks(visibility, question.key)).toBe(true);
		}
	});

	it('stops asking exactly the stored keys', () => {
		const visibility = fixedQuestionVisibility('["abstract","trackId"]');

		expect(asks(visibility, 'abstract')).toBe(false);
		expect(asks(visibility, 'trackId')).toBe(false);
		expect(asks(visibility, 'keyTakeaway')).toBe(true);
		expect(asks(visibility, 'title')).toBe(true);
	});

	// Every rejection here is a control that stays on the form. Hiding on a key
	// this build does not understand would remove a control while the server went
	// on requiring what it collected.
	it('ignores anything it cannot honour rather than hiding on it', () => {
		expect(parseHiddenFixedKeys('not json')).toEqual([]);
		expect(parseHiddenFixedKeys('{"abstract":true}')).toEqual([]);
		expect(parseHiddenFixedKeys('["abstract",7,null]')).toEqual(['abstract']);
		// Removing the title is refused at every layer, this one included.
		expect(parseHiddenFixedKeys('["title","speakerName","speakerEmail"]')).toEqual([]);
		expect(parseHiddenFixedKeys('["fromAFutureRelease"]')).toEqual([]);
	});

	// An unknown key answers "asked", so a question that leaves the list cannot
	// take a control that is still rendered off the form with it.
	it('treats a question it has never heard of as asked', () => {
		expect(asks(fixedQuestionVisibility(null), 'inventedLater')).toBe(true);
	});

	it('writes a set, not a log: sorted, unique, and filtered', () => {
		expect(serializeHiddenFixedKeys(['trackId', 'abstract', 'abstract', 'title'])).toBe(
			'["abstract","trackId"]'
		);
	});

	it('lets go of everything except what names the talk and the speaker', () => {
		const permanent = FIXED_QUESTIONS.filter((q) => !isRemovable(q.key)).map((q) => q.key);

		expect(permanent).toEqual(['title', 'speakerName', 'speakerEmail']);
		// And each of them says why on the row, since the screen offers no button.
		for (const key of permanent) {
			expect(FIXED_QUESTIONS.find((q) => q.key === key)?.permanentBecause).toBeTruthy();
		}
		expect(REMOVABLE_FIXED_KEYS.length).toBe(FIXED_QUESTIONS.length - permanent.length);
	});

	// The keys are stored in a database column: a rename is a silent un-hide on
	// every conference that had removed that question.
	it('names its keys after the controls they switch off', () => {
		const single = FIXED_QUESTIONS.filter((q) => q.names.length === 1);
		expect(single.length).toBeGreaterThan(6);
		for (const question of single) expect(question.key).toBe(question.names[0]);
	});

	it('gives every question a key, and no two the same', () => {
		const keys = FIXED_QUESTIONS.map((q) => q.key);
		expect(keys.every(Boolean)).toBe(true);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
