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
import { FIXED_QUESTION_GROUPS, FIXED_QUESTION_NAMES } from './fixed-questions';

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
