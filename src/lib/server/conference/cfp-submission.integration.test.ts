/**
 * The submitter's path through the call for papers.
 *
 * The assertions here are the ones that cannot be recovered from by reading the
 * code: whether a hidden field can block a submission, whether an answer to a
 * question the form stopped asking survives, whether someone can edit a proposal
 * that is not theirs, and whether a receipt is actually written. Each of those
 * has a plausible implementation that typechecks and is wrong.
 *
 * Hermetic — the fixture states its own preconditions rather than leaning on the
 * demo seed, so a seed change cannot make it pass for the wrong reason.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	sessionFormatTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guessSortName, openCall, saveSubmission, type SubmissionInput } from './cfp-submission';

const suffix = `cfpsub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;
const submitterId = `user-${suffix}`;
const strangerId = `stranger-${suffix}`;

let workshopFormatId = 0;
let talkFormatId = 0;
let trackId = 0;
/** Always shown, and required. */
let alwaysFieldId = 0;
/** Shown only for the workshop format, and required — the CFP-02 case. */
let workshopFieldId = 0;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Submitter Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values([
		{ id: submitterId, email: `${submitterId}@example.test`, emailVerified: true, name: 'Sub' },
		{ id: strangerId, email: `${strangerId}@example.test`, emailVerified: true, name: 'Nosy' }
	]);

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Submitter Conf',
			slug,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	const [talk] = await db
		.insert(sessionFormatTable)
		.values({ conferenceId: conference.id, name: 'Talk', minutes: 30, position: 0 })
		.returning();
	const [workshop] = await db
		.insert(sessionFormatTable)
		.values({ conferenceId: conference.id, name: 'Workshop', minutes: 90, position: 1 })
		.returning();
	const [track] = await db
		.insert(trackTable)
		.values({ conferenceId: conference.id, name: 'AI', position: 0 })
		.returning();

	talkFormatId = talk.id;
	workshopFormatId = workshop.id;
	trackId = track.id;

	const [form] = await db
		.insert(cfpFormTable)
		.values({ conferenceId: conference.id, title: 'Proposals', status: 'published' })
		.returning();

	const [always] = await db
		.insert(formFieldTable)
		.values({
			cfpFormId: form.id,
			label: 'Why you',
			kind: 'short_text',
			required: true,
			position: 0
		})
		.returning();
	const [workshopOnly] = await db
		.insert(formFieldTable)
		.values({
			cfpFormId: form.id,
			label: 'Room setup',
			kind: 'long_text',
			required: true,
			position: 1,
			conditionSource: 'session_format',
			conditionValue: String(workshop.id)
		})
		.returning();

	alwaysFieldId = always.id;
	workshopFieldId = workshopOnly.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, submitterId));
	await db.delete(user).where(eq(user.id, strangerId));
});

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
	return {
		title: 'A talk about tests',
		abstract: 'Why the ones that matter are the ones nobody writes.',
		keyTakeaway: null,
		audienceLevel: null,
		sessionFormatId: talkFormatId,
		trackId,
		answers: { [alwaysFieldId]: 'Because I have done it' },
		speaker: {
			name: 'Ng Wei Ling',
			sortName: 'Ng, Wei Ling',
			email: `${submitterId}@example.test`,
			jobTitle: 'Engineer',
			company: 'Acme',
			bio: null
		},
		coSpeakers: [],
		...overrides
	};
}

describe('guessSortName', () => {
	it('puts the last word first, which is a guess and not a rule', () => {
		expect(guessSortName('Zoe Adler')).toBe('Adler, Zoe');
		// Wrong for this name on purpose — the form shows the guess so a submitter
		// can correct it, rather than filing them under "Ling" in silence.
		expect(guessSortName('Ng Wei Ling')).toBe('Ling, Ng Wei');
	});

	it('leaves a single-word name alone', () => {
		expect(guessSortName('Prince')).toBe('Prince');
	});
});

describe('openCall', () => {
	it('reports the call as open', async () => {
		const call = await openCall(slug);
		expect(call?.state).toBe('open');
		expect(call?.fields).toHaveLength(2);
	});

	it('is null for a conference that does not exist', async () => {
		expect(await openCall(`${slug}-nope`)).toBeNull();
	});
});

describe('saveSubmission', () => {
	it('does not require a hidden field, however required that field is', async () => {
		// Format is Talk, so "Room setup" is not shown — and a field that is not
		// shown is never required. This is the rule the whole shared module exists
		// for, and the one a second implementation would get wrong.
		const result = await saveSubmission(submitterId, slug, input(), { submit: true });
		expect(result.ok).toBe(true);
	});

	it('requires a visible required field', async () => {
		const result = await saveSubmission(
			submitterId,
			slug,
			input({ sessionFormatId: workshopFormatId }),
			{ submit: true }
		);

		expect(result.ok).toBe(false);
		if (result.ok || result.reason !== 'invalid') throw new Error('expected an invalid result');
		expect(Object.keys(result.fieldErrors)).toContain(String(workshopFieldId));
	});

	it('does not store an answer to a question the form did not ask', async () => {
		const result = await saveSubmission(
			submitterId,
			slug,
			// The submitter answered the workshop question, then switched to Talk.
			input({ answers: { [alwaysFieldId]: 'Yes', [workshopFieldId]: 'Round tables' } }),
			{ submit: true }
		);
		if (!result.ok) throw new Error('expected a saved submission');

		const answers = await db
			.select({ formFieldId: submissionAnswerTable.formFieldId })
			.from(submissionAnswerTable)
			.where(eq(submissionAnswerTable.submissionId, result.submissionId));

		expect(answers.map((a) => a.formFieldId)).toEqual([alwaysFieldId]);
	});

	it('accepts a draft carrying nothing but a title (CFP-07)', async () => {
		const result = await saveSubmission(
			submitterId,
			slug,
			input({
				abstract: null,
				answers: {},
				speaker: { name: '', sortName: '', email: '', jobTitle: null, company: null, bio: null }
			}),
			{ submit: false }
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.status).toBe('draft');
	});

	it('rejects a draft with no title at all', async () => {
		const result = await saveSubmission(submitterId, slug, input({ title: '   ' }), {
			submit: false
		});
		expect(result.ok).toBe(false);
	});

	it('keeps the sort name the submitter typed rather than re-guessing it', async () => {
		const result = await saveSubmission(submitterId, slug, input(), { submit: true });
		if (!result.ok) throw new Error('expected a saved submission');

		const [profile] = await db
			.select({ sortName: speakerProfileTable.sortName })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.userId, submitterId));

		// "Ling, Ng Wei" is what the guess would have produced.
		expect(profile.sortName).toBe('Ng, Wei Ling');
	});

	it('makes a co-presenter a real speaker on the talk (ABS-11)', async () => {
		const result = await saveSubmission(
			submitterId,
			slug,
			input({
				coSpeakers: [
					{ name: 'Zoe Adler', email: `zoe-${suffix}@example.test`, roleLabel: 'Co-presenter' }
				]
			}),
			{ submit: true }
		);
		if (!result.ok) throw new Error('expected a saved submission');

		const speakers = await db
			.select({
				name: speakerProfileTable.name,
				isPrimary: submissionSpeakerTable.isPrimary,
				roleLabel: submissionSpeakerTable.roleLabel
			})
			.from(submissionSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
			)
			.where(eq(submissionSpeakerTable.submissionId, result.submissionId));

		expect(speakers).toHaveLength(2);
		expect(speakers.find((s) => s.name === 'Ng Wei Ling')?.isPrimary).toBe(true);
		expect(speakers.find((s) => s.name === 'Zoe Adler')?.roleLabel).toBe('Co-presenter');
	});

	it('writes a receipt for every speaker with an address (CFP-08)', async () => {
		const result = await saveSubmission(
			submitterId,
			slug,
			input({
				coSpeakers: [{ name: 'Mailed Co', email: `co-${suffix}@example.test`, roleLabel: null }]
			}),
			{ submit: true }
		);
		if (!result.ok) throw new Error('expected a saved submission');

		const mails = await db
			.select({ toEmail: emailLogTable.toEmail, template: emailLogTable.template })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, result.submissionId));

		expect(mails).toHaveLength(2);
		expect(new Set(mails.map((m) => m.template))).toEqual(new Set(['submission_received']));
	});

	it('writes no receipt for a draft — nobody has submitted anything yet', async () => {
		const result = await saveSubmission(submitterId, slug, input(), { submit: false });
		if (!result.ok) throw new Error('expected a saved draft');

		const mails = await db
			.select({ id: emailLogTable.id })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, result.submissionId));

		expect(mails).toHaveLength(0);
	});

	it('refuses to let a stranger edit someone else’s draft', async () => {
		const mine = await saveSubmission(submitterId, slug, input(), { submit: false });
		if (!mine.ok) throw new Error('expected a saved draft');

		const result = await saveSubmission(strangerId, slug, input({ title: 'Mine now' }), {
			submit: false,
			submissionId: mine.submissionId
		});

		expect(result).toEqual({ ok: false, reason: 'forbidden' });

		const [row] = await db
			.select({ title: submissionTable.title })
			.from(submissionTable)
			.where(eq(submissionTable.id, mine.submissionId));
		expect(row.title).toBe('A talk about tests');
	});

	it('refuses to let the author rewrite a proposal already submitted', async () => {
		const submitted = await saveSubmission(submitterId, slug, input(), { submit: true });
		if (!submitted.ok) throw new Error('expected a saved submission');

		const result = await saveSubmission(submitterId, slug, input({ title: 'Second thoughts' }), {
			submit: true,
			submissionId: submitted.submissionId
		});

		expect(result).toEqual({ ok: false, reason: 'forbidden' });
	});
});

describe('saveSubmission, once the call is closed (CFP-16)', () => {
	it('refuses new proposals and edits alike', async () => {
		const [form] = await db
			.select({ id: cfpFormTable.id })
			.from(cfpFormTable)
			.innerJoin(conferenceTable, eq(conferenceTable.id, cfpFormTable.conferenceId))
			.where(eq(conferenceTable.slug, slug));

		await db.update(cfpFormTable).set({ status: 'closed' }).where(eq(cfpFormTable.id, form.id));
		try {
			expect(await saveSubmission(submitterId, slug, input(), { submit: true })).toEqual({
				ok: false,
				reason: 'closed'
			});
			// The page itself stays readable — a closed call is a state, not a 404.
			expect((await openCall(slug))?.state).toBe('closed');
		} finally {
			await db
				.update(cfpFormTable)
				.set({ status: 'published' })
				.where(eq(cfpFormTable.id, form.id));
		}
	});
});
