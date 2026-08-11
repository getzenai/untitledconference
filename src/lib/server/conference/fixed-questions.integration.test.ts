/**
 * A call that has removed some of the form's built-in questions (#159).
 *
 * Three things here have a plausible implementation that typechecks and is
 * wrong, and none of them is visible from the screen:
 *
 *  1. **A removed question must stop being required.** Get this wrong and the
 *     organizer's own form becomes unsubmittable — the abstract is demanded and
 *     never displayed.
 *  2. **A removed question must stop being stored.** The rule the conditional
 *     fields already follow: not rendered means inconsequential on the server, so
 *     a hand-written POST cannot leave an answer to a question nobody asked.
 *  3. **A removed *speaker* question must not erase the profile.** The speaker
 *     profile belongs to the organization, not to one call. Clearing the company
 *     because this call stopped asking would delete what the roster or another
 *     call recorded — and it would look exactly like the "cleared it on purpose"
 *     path that already exists.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { cfpFormTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setFixedQuestionShown } from './cfp-form';
import { openCall, saveSubmission, type SubmissionInput } from './cfp-submission';

const suffix = `fixedq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;
const submitterId = `user-${suffix}`;

let conferenceId = 0;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Fixed Questions Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: submitterId,
		email: `${submitterId}@example.test`,
		emailVerified: true,
		name: 'Sam Submitter'
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Fixed Questions Conf',
			slug,
			startsOn: '2028-04-01',
			endsOn: '2028-04-01',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	await db
		.insert(cfpFormTable)
		.values({ conferenceId: conference.id, title: 'Proposals', status: 'published' });
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, submitterId));
});

/** Whatever the call currently asks — read back, never assumed. */
const storedHidden = async () => {
	const [row] = await db
		.select({ hidden: cfpFormTable.hiddenFixedFields })
		.from(cfpFormTable)
		.where(eq(cfpFormTable.conferenceId, conferenceId));
	return row.hidden;
};

const setHidden = async (keys: string[]) =>
	db
		.update(cfpFormTable)
		.set({ hiddenFixedFields: keys.length ? JSON.stringify(keys) : null })
		.where(eq(cfpFormTable.conferenceId, conferenceId));

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
	return {
		title: 'A talk about tests',
		abstract: 'The abstract as the speaker wrote it.',
		keyTakeaway: 'Take this away.',
		audienceLevel: 'Intermediate',
		sessionFormatId: null,
		trackId: null,
		answers: {},
		speaker: {
			name: 'Sam Submitter',
			sortName: '',
			email: `${submitterId}@example.test`,
			jobTitle: 'Engineer',
			company: 'Acme',
			bio: 'Writes tests.'
		},
		coSpeakers: [],
		...overrides
	};
}

const submit = (overrides: Partial<SubmissionInput> = {}) =>
	saveSubmission(submitterId, slug, input(overrides), { submit: true });

const storedSubmission = async (id: number) => {
	const [row] = await db.select().from(submissionTable).where(eq(submissionTable.id, id));
	return row;
};

const ownProfile = async () => {
	const [row] = await db
		.select()
		.from(speakerProfileTable)
		.where(eq(speakerProfileTable.userId, submitterId));
	return row;
};

describe('switching a built-in question off', () => {
	it('stores the removal and takes it back', async () => {
		await setHidden([]);

		expect(await setFixedQuestionShown(conferenceId, 'abstract', false)).toBe(true);
		expect(await storedHidden()).toBe('["abstract"]');

		// Twice off is still once off — the column is a set, not a log.
		expect(await setFixedQuestionShown(conferenceId, 'abstract', false)).toBe(true);
		expect(await storedHidden()).toBe('["abstract"]');

		expect(await setFixedQuestionShown(conferenceId, 'abstract', true)).toBe(true);
		expect(await storedHidden()).toBe('[]');
	});

	it('refuses the three that name the talk and the speaker', async () => {
		await setHidden([]);

		for (const key of ['title', 'speakerName', 'speakerEmail']) {
			expect(await setFixedQuestionShown(conferenceId, key, false)).toBe(false);
		}
		expect(await storedHidden()).toBeNull();
	});

	it('refuses a key it does not know', async () => {
		await setHidden([]);
		expect(await setFixedQuestionShown(conferenceId, 'inventedLater', false)).toBe(false);
		expect(await storedHidden()).toBeNull();
	});

	// The organizer of conference A must not reach B's form. The field key is
	// user input and so is the conference — the same rule every other mutation in
	// `cfp-form` follows.
	it('refuses a conference that has no call', async () => {
		const [conference] = await db
			.insert(conferenceTable)
			.values({ organizationId, name: 'No Call', slug: `${slug}-nocall`, status: 'draft' })
			.returning();

		expect(await setFixedQuestionShown(conference.id, 'abstract', false)).toBe(false);
	});
});

describe('a call that has removed questions', () => {
	it('says so on the call the submitter reads', async () => {
		await setHidden(['abstract', 'keyTakeaway']);
		const call = await openCall(slug);

		expect(call?.fixed.abstract).toBe(false);
		expect(call?.fixed.keyTakeaway).toBe(false);
		expect(call?.fixed.audienceLevel).toBe(true);
		expect(call?.fixed.title).toBe(true);
	});

	it('accepts a submission without the abstract it stopped asking for', async () => {
		await setHidden(['abstract']);

		const result = await submit({ abstract: null });

		expect(result.ok).toBe(true);
	});

	it('still demands an abstract while it asks for one', async () => {
		await setHidden([]);

		const result = await submit({ abstract: '   ' });

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid',
			errors: { abstract: 'An abstract is required.' }
		});
	});

	// A POST is not a form. Nothing stops someone sending the field the screen no
	// longer draws, and the answer would then sit on the submission looking like
	// something a submitter typed.
	it('does not store an answer posted to a question it does not ask', async () => {
		await setHidden(['abstract', 'keyTakeaway', 'audienceLevel']);

		const result = await submit({
			abstract: 'Posted by hand.',
			keyTakeaway: 'Posted by hand.',
			audienceLevel: 'Posted by hand.'
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const stored = await storedSubmission(result.submissionId);
		expect(stored.abstract).toBeNull();
		expect(stored.keyTakeaway).toBeNull();
		expect(stored.audienceLevel).toBeNull();
		// And the question it does still ask is stored as usual.
		expect(stored.title).toBe('A talk about tests');
	});

	/**
	 * The difference between "we stop asking" and "we delete what you wrote".
	 *
	 * The builder tells the organizer that answers already given stay on their
	 * submissions. The moment that stops being true is the speaker's next edit —
	 * writing the removed columns as null would quietly empty every abstract on
	 * the call, one typo fix at a time, and nobody would connect the two.
	 */
	it('leaves an existing answer alone when the question is removed afterwards', async () => {
		await setHidden([]);
		const first = await submit();
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		await setHidden(['abstract', 'audienceLevel']);
		const again = await saveSubmission(
			submitterId,
			slug,
			input({ title: 'A talk about tests, fixed', abstract: null, audienceLevel: null }),
			{ submit: true, submissionId: first.submissionId }
		);
		expect(again.ok).toBe(true);

		const stored = await storedSubmission(first.submissionId);
		expect(stored.title).toBe('A talk about tests, fixed');
		expect(stored.abstract).toBe('The abstract as the speaker wrote it.');
		expect(stored.audienceLevel).toBe('Intermediate');
	});

	/**
	 * The one that would go unnoticed for months: the speaker profile is shared
	 * across the organization, and a submit already treats an empty optional field
	 * as "cleared on purpose".
	 */
	it('does not erase a speaker profile field the call stopped asking about', async () => {
		await setHidden([]);
		await submit();
		expect((await ownProfile()).company).toBe('Acme');

		await setHidden(['speakerCompany', 'speakerBio']);
		await submit({ speaker: { ...input().speaker, company: null, bio: null } });

		const profile = await ownProfile();
		expect(profile.company).toBe('Acme');
		expect(profile.bio).toBe('Writes tests.');
	});

	it('still clears an optional field the call does ask about', async () => {
		await setHidden([]);
		await submit();
		expect((await ownProfile()).jobTitle).toBe('Engineer');

		await submit({ speaker: { ...input().speaker, jobTitle: null } });

		expect((await ownProfile()).jobTitle).toBeNull();
	});
});
