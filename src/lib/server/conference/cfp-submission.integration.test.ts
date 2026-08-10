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
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guessSortName, openCall, saveSubmission, type SubmissionInput } from './cfp-submission';
import { draftForConference, editableDraft } from './speaker-portal';

const suffix = `cfpsub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;
/** A second conference, to prove a draft cannot be moved between tenants. */
const otherSlug = `other-${suffix}`;
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

	const [other] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Other Conf',
			slug: otherSlug,
			startsOn: '2027-09-01',
			endsOn: '2027-09-01',
			status: 'published'
		})
		.returning();
	await db
		.insert(cfpFormTable)
		.values({ conferenceId: other.id, title: 'Other proposals', status: 'published' });
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

	it('carries the organizer’s intro text to the public page', async () => {
		// The text decides whether someone submits at all, so it has to survive the
		// trip from the builder to the page that shows the form.
		const formId = (await openCall(slug))!.form.id;

		await db
			.update(cfpFormTable)
			.set({ description: 'What we are looking for.' })
			.where(eq(cfpFormTable.id, formId));

		expect((await openCall(slug))?.form.description).toBe('What we are looking for.');

		await db.update(cfpFormTable).set({ description: null }).where(eq(cfpFormTable.id, formId));
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

describe('finishing a draft (CFP-07, the resume half)', () => {
	it('loads a saved draft back in the shape the form fills from', async () => {
		const saved = await saveSubmission(
			submitterId,
			slug,
			input({
				title: 'Half written',
				abstract: 'Started this on the train.',
				coSpeakers: [{ name: 'Zoe Adler', email: null, roleLabel: 'Co-presenter' }]
			}),
			{ submit: false }
		);
		if (!saved.ok) throw new Error('expected a saved draft');

		const editable = await editableDraft(submitterId, saved.submissionId);
		expect(editable).not.toBeNull();
		expect(editable!.conferenceSlug).toBe(slug);
		expect(editable!.draft.title).toBe('Half written');
		expect(editable!.draft.abstract).toBe('Started this on the train.');
		// Answers come back keyed by field id, which is what `answer:<id>` needs.
		expect(editable!.draft.answers[alwaysFieldId]).toBe('Because I have done it');
		// The submitter is not in their own co-presenter list.
		expect(editable!.draft.coSpeakers).toEqual([
			{ name: 'Zoe Adler', email: '', roleLabel: 'Co-presenter' }
		]);
		expect(editable!.draft.speaker.sortName).toBe('Ng, Wei Ling');
	});

	it('turns the same draft into a submission instead of a second one', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Will finish' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a saved draft');

		const finished = await saveSubmission(
			submitterId,
			slug,
			input({ title: 'Will finish', abstract: 'Now complete.' }),
			{ submit: true, submissionId: saved.submissionId }
		);
		if (!finished.ok) throw new Error('expected the draft to be submitted');

		// The whole point: one proposal, not two. Before the edit route existed,
		// finishing a draft created a duplicate.
		expect(finished.submissionId).toBe(saved.submissionId);
		expect(finished.status).toBe('submitted');

		const rows = await db
			.select({ id: submissionTable.id, status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));
		expect(rows[0].status).toBe('submitted');
	});

	it('stops offering a draft for editing once it has been submitted', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'One way' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a saved draft');

		await saveSubmission(submitterId, slug, input({ title: 'One way' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		expect(await editableDraft(submitterId, saved.submissionId)).toBeNull();
	});

	it('does not hand a draft to anyone but its author', async () => {
		const saved = await saveSubmission(submitterId, slug, input(), { submit: false });
		if (!saved.ok) throw new Error('expected a saved draft');

		expect(await editableDraft(strangerId, saved.submissionId)).toBeNull();
	});

	it('refuses to move a draft to another conference', async () => {
		const saved = await saveSubmission(submitterId, slug, input(), { submit: false });
		if (!saved.ok) throw new Error('expected a saved draft');

		// The UI cannot do this; the exported API could, and the API is what these
		// tests legitimise. `persist` overwrites conferenceId, so without the check
		// this would move a proposal between tenants.
		const result = await saveSubmission(submitterId, otherSlug, input(), {
			submit: false,
			submissionId: saved.submissionId
		});

		expect(result).toEqual({ ok: false, reason: 'forbidden' });
	});

	it('keeps the profile a draft-save left blank', async () => {
		// Fill the profile, then save a draft with an empty "About you" — which is
		// exactly what a title-only draft posts.
		await saveSubmission(submitterId, slug, input(), { submit: false });
		await saveSubmission(
			submitterId,
			slug,
			input({
				title: 'Only a title',
				speaker: { name: '', sortName: '', email: '', jobTitle: null, company: null, bio: null }
			}),
			{ submit: false }
		);

		const [profile] = await db
			.select({ name: speakerProfileTable.name, company: speakerProfileTable.company })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.userId, submitterId));

		// A nameless speaker in the organizer's list, with nothing to explain it,
		// is what this prevents.
		expect(profile.name).toBe('Ng Wei Ling');
		expect(profile.company).toBe('Acme');
	});
});

describe('what the receipt promises', () => {
	it('does not offer an edit that the code forbids', async () => {
		const result = await saveSubmission(submitterId, slug, input(), { submit: true });
		if (!result.ok) throw new Error('expected a saved submission');

		const [mail] = await db
			.select({ body: emailLogTable.bodyPreview })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, result.submissionId));

		// A submitted proposal is locked — `draft` is required to edit and there is
		// no unsubmit path. This assertion exists because the same copy-ahead-of-
		// code defect has now appeared twice, in two different strings.
		expect(mail.body?.toLowerCase()).not.toContain('edit');
		expect(mail.body).toContain('speaker portal');
	});
});

describe('the speaker profile behind a proposal', () => {
	it('prefills from the right organization, not an arbitrary one', async () => {
		// The same person, speaking at a second organization with a different bio.
		const otherOrgId = `org2-${suffix}`;
		await db.insert(organization).values({
			id: otherOrgId,
			name: 'Second Org',
			slug: otherOrgId,
			createdAt: new Date()
		});
		await db.insert(speakerProfileTable).values({
			organizationId: otherOrgId,
			userId: submitterId,
			name: 'Ng Wei Ling',
			sortName: 'Ng, Wei Ling',
			company: 'A DIFFERENT COMPANY'
		});

		try {
			const saved = await saveSubmission(submitterId, slug, input(), { submit: false });
			if (!saved.ok) throw new Error('expected a saved draft');

			const editable = await editableDraft(submitterId, saved.submissionId);
			// Without an org-scoped read, whichever profile the database returned
			// first would be prefilled — and saving would carry it into this org.
			expect(editable!.draft.speaker.company).toBe('Acme');
		} finally {
			await db.delete(organization).where(eq(organization.id, otherOrgId));
		}
	});

	it('clears a field the submitter deliberately emptied on submit', async () => {
		await saveSubmission(submitterId, slug, input(), { submit: true });

		await saveSubmission(
			submitterId,
			slug,
			input({
				speaker: {
					name: 'Ng Wei Ling',
					sortName: 'Ng, Wei Ling',
					email: `${submitterId}@example.test`,
					jobTitle: 'Engineer',
					company: null,
					bio: null
				}
			}),
			{ submit: true }
		);

		const [profile] = await db
			.select({ company: speakerProfileTable.company })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.userId, submitterId),
					eq(speakerProfileTable.organizationId, organizationId)
				)
			);

		// Emptying a field on a full submit is a decision. Only a draft-save treats
		// an empty field as "not finished yet".
		expect(profile.company).toBeNull();
	});
});

describe('draftForConference', () => {
	it('finds the unfinished proposal so the public form can point at it', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Unfinished' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a saved draft');

		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		const found = await draftForConference(submitterId, conference.id);
		expect(found?.id).toBe(saved.submissionId);
		expect(found?.title).toBe('Unfinished');
	});

	it("does not point a stranger at someone else's draft", async () => {
		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		expect(await draftForConference(strangerId, conference.id)).toBeNull();
	});
});
