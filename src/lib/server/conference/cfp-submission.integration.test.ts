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
import {
	guessSortName,
	listOpenCalls,
	openCall,
	saveSubmission,
	withdrawSubmission,
	type SubmissionInput
} from './cfp-submission';
import { sameAddress } from './speaker-identity';
import { editableDraft, mySubmissions, submissionForConference } from './speaker-portal';

const suffix = `cfpsub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;
/** A second conference, to prove a draft cannot be moved between tenants. */
const otherSlug = `other-${suffix}`;
const submitterId = `user-${suffix}`;
const strangerId = `stranger-${suffix}`;
/** Named as a co-presenter before they had an account, then signs up (#330). */
const coSpeakerId = `co-speaker-${suffix}`;
const coSpeakerEmail = `${coSpeakerId}@example.test`;
/** Submits a proposal describing somebody else, the way the organizer did on prod (#229). */
const jordanId = `jordan-${suffix}`;
/** Marcus, who exists as a profile in this organization and has no account. */
const marcusEmail = `marcus-${suffix}@example.test`;

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
		{ id: strangerId, email: `${strangerId}@example.test`, emailVerified: true, name: 'Nosy' },
		{ id: coSpeakerId, email: coSpeakerEmail, emailVerified: true, name: 'Dana Okonkwo' },
		{ id: jordanId, email: `${jordanId}@example.test`, emailVerified: true, name: 'Jordan Vale' }
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
	await db.delete(user).where(eq(user.id, coSpeakerId));
	await db.delete(user).where(eq(user.id, jordanId));
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

	// This used to assert the opposite — that a submitted proposal was frozen. The
	// call's own copy promises editing until it closes, and forcing people back
	// through the public form to amend anything is what produced the duplicate
	// pairs in the organizer's list, so the rule changed rather than the copy.
	it('lets the author rewrite a proposal that is already submitted', async () => {
		const submitted = await saveSubmission(submitterId, slug, input(), { submit: true });
		if (!submitted.ok) throw new Error('expected a saved submission');

		const result = await saveSubmission(submitterId, slug, input({ title: 'Second thoughts' }), {
			submit: true,
			submissionId: submitted.submissionId
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.submissionId).toBe(submitted.submissionId);
	});

	it('still refuses to rewrite one that has been decided', async () => {
		const submitted = await saveSubmission(submitterId, slug, input(), { submit: true });
		if (!submitted.ok) throw new Error('expected a saved submission');

		await db
			.update(submissionTable)
			.set({ status: 'rejected', decidedAt: new Date() })
			.where(eq(submissionTable.id, submitted.submissionId));

		const result = await saveSubmission(submitterId, slug, input({ title: 'Too late' }), {
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

	// Also inverted deliberately: submitting no longer ends the right to edit, so
	// the form must still open. What ends it is a decision, asserted below.
	it('keeps offering it for editing once it has been submitted', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'One way' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a saved draft');

		await saveSubmission(submitterId, slug, input({ title: 'One way' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		const editable = await editableDraft(submitterId, saved.submissionId);
		expect(editable).not.toBeNull();
		expect(editable?.status).toBe('submitted');
	});

	it('keeps offering it while it is in review', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Being read' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(eq(submissionTable.id, saved.submissionId));

		const editable = await editableDraft(submitterId, saved.submissionId);
		expect(editable).not.toBeNull();
		expect(editable?.status).toBe('in_review');
	});

	it('stops offering it once it has been decided', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Decided one' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a saved submission');

		await db
			.update(submissionTable)
			.set({ status: 'accepted', decidedAt: new Date() })
			.where(eq(submissionTable.id, saved.submissionId));

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

describe('submissionForConference', () => {
	it('finds the unfinished proposal so the public form can point at it', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Unfinished' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a saved draft');

		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		const found = await submissionForConference(submitterId, conference.id);
		expect(found?.id).toBe(saved.submissionId);
		expect(found?.title).toBe('Unfinished');
	});

	it("does not point a stranger at someone else's draft", async () => {
		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		expect(await submissionForConference(strangerId, conference.id)).toBeNull();
	});
});

describe('editing a proposal that is already submitted (CFP-07)', () => {
	it('lets the submitter rewrite it while the call is open', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'First wording' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		const edited = await saveSubmission(submitterId, slug, input({ title: 'Second wording' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		expect(edited.ok).toBe(true);
		if (!edited.ok) return;
		// The same proposal, rewritten — not a second one.
		expect(edited.submissionId).toBe(saved.submissionId);

		const [row] = await db
			.select({ title: submissionTable.title, status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));
		expect(row).toMatchObject({ title: 'Second wording', status: 'submitted' });
	});

	it('keeps the original receipt time when an edit is re-submitted', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Receipt' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		const [before] = await db
			.select({ submittedAt: submissionTable.submittedAt })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));

		await saveSubmission(submitterId, slug, input({ title: 'Receipt, reworded' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		const [after] = await db
			.select({ submittedAt: submissionTable.submittedAt })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));

		// The receipt is what the speaker was told and what the organizer sees. An
		// edit is not a new submission.
		expect(after.submittedAt?.getTime()).toBe(before.submittedAt?.getTime());
	});

	it('never demotes a submitted proposal back to a draft', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Stays in' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		// A draft-save posted at an already-submitted proposal must not withdraw it
		// from the organizer's list by a side door.
		await saveSubmission(submitterId, slug, input({ title: 'Stays in, edited' }), {
			submit: false,
			submissionId: saved.submissionId
		});

		const [row] = await db
			.select({ status: submissionTable.status, submittedAt: submissionTable.submittedAt })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));

		expect(row.status).toBe('submitted');
		expect(row.submittedAt).not.toBeNull();
	});

	it('keeps the right, the standing and the silence once the review has begun (CFP-09)', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Under review' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(eq(submissionTable.id, saved.submissionId));

		const edited = await saveSubmission(
			submitterId,
			slug,
			input({ title: 'Under review, reworded' }),
			{ submit: true, submissionId: saved.submissionId }
		);
		expect(edited.ok).toBe(true);

		// The review having started is not a decision: the words may still move,
		// and the standing the organizers gave the proposal stays as it was.
		const [row] = await db
			.select({ title: submissionTable.title, status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));
		expect(row).toMatchObject({ title: 'Under review, reworded', status: 'in_review' });

		// One receipt, from the arrival — the edit is not a second submission.
		const mails = await db
			.select({ id: emailLogTable.id })
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, saved.submissionId));
		expect(mails).toHaveLength(1);
	});

	it('refuses to rewrite a proposal once it has been decided', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Decided' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		await db
			.update(submissionTable)
			.set({ status: 'accepted', decidedAt: new Date() })
			.where(eq(submissionTable.id, saved.submissionId));

		const result = await saveSubmission(submitterId, slug, input({ title: 'Too late' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('forbidden');
	});

	it('still refuses a stranger', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Not yours' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		const result = await saveSubmission(strangerId, slug, input({ title: 'Mine now' }), {
			submit: true,
			submissionId: saved.submissionId
		});

		expect(result.ok).toBe(false);
	});
});

describe('the public form points at what you already sent', () => {
	// Its own account: the shared submitter already has an unfinished draft here
	// from an earlier test, and a draft legitimately outranks a submitted proposal
	// in this signpost — that is asserted separately below.
	const soloId = `solo-${suffix}`;

	/**
	 * Their own details, not the shared submitter's. The `input()` helper states
	 * the submitter's address, and stating somebody else's is exactly what #229
	 * refuses — the fixture was quietly describing the wrong person.
	 */
	function ownDetails(id: string, name: string): SubmissionInput['speaker'] {
		return {
			name,
			sortName: guessSortName(name),
			email: `${id}@example.test`,
			jobTitle: null,
			company: null,
			bio: null
		};
	}

	beforeAll(async () => {
		await db.insert(user).values({
			id: soloId,
			email: `${soloId}@example.test`,
			emailVerified: true,
			name: 'Solo'
		});
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, soloId));
	});

	it('finds a submitted proposal, not just an unfinished one', async () => {
		const saved = await saveSubmission(
			soloId,
			slug,
			input({ title: 'Already sent', speaker: ownDetails(soloId, 'Solo Speaker') }),
			{ submit: true }
		);
		if (!saved.ok) throw new Error('expected a submitted proposal');

		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		// Showing a blank form to someone who already proposed is what produced the
		// duplicate pairs in the organizer's list: re-using the form was the only
		// way to amend anything.
		const found = await submissionForConference(soloId, conference.id);
		expect(found?.id).toBe(saved.submissionId);
		expect(found?.status).toBe('submitted');
	});

	it('still points at a proposal the review has picked up', async () => {
		const readerId = `reader-${suffix}`;
		await db.insert(user).values({
			id: readerId,
			email: `${readerId}@example.test`,
			emailVerified: true,
			name: 'Reader'
		});
		try {
			const saved = await saveSubmission(
				readerId,
				slug,
				input({ title: 'Being reviewed', speaker: ownDetails(readerId, 'Reader Reyes') }),
				{ submit: true }
			);
			if (!saved.ok) throw new Error('expected a submitted proposal');

			await db
				.update(submissionTable)
				.set({ status: 'in_review' })
				.where(eq(submissionTable.id, saved.submissionId));

			const [conference] = await db
				.select({ id: conferenceTable.id })
				.from(conferenceTable)
				.where(eq(conferenceTable.slug, slug));

			// A proposal under review is still this speaker's one proposal here; a
			// blank form would invite the duplicate the signpost exists to prevent.
			const found = await submissionForConference(readerId, conference.id);
			expect(found?.id).toBe(saved.submissionId);
			expect(found?.status).toBe('in_review');
		} finally {
			await db.delete(user).where(eq(user.id, readerId));
		}
	});

	it('prefers an unfinished draft when there is both', async () => {
		const draft = await saveSubmission(
			soloId,
			slug,
			input({ title: 'Still writing', speaker: ownDetails(soloId, 'Solo Speaker') }),
			{ submit: false }
		);
		if (!draft.ok) throw new Error('expected a draft');

		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		// The unfinished one is the one still asking for something.
		const found = await submissionForConference(soloId, conference.id);
		expect(found?.id).toBe(draft.submissionId);
		expect(found?.status).toBe('draft');
	});
});

describe('listOpenCalls', () => {
	it('includes a published conference whose call is taking submissions', async () => {
		const calls = await listOpenCalls();
		expect(calls.some((row) => row.slug === slug)).toBe(true);
	});

	it('drops the conference the moment the public site would', async () => {
		const [conference] = await db
			.select({ id: conferenceTable.id, status: conferenceTable.status })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));
		expect(conference?.status).toBe('published');

		await db
			.update(conferenceTable)
			.set({ status: 'draft' })
			.where(eq(conferenceTable.id, conference.id));
		try {
			expect((await listOpenCalls()).some((row) => row.slug === slug)).toBe(false);
			expect(await openCall(slug)).toBeNull();
		} finally {
			await db
				.update(conferenceTable)
				.set({ status: 'published' })
				.where(eq(conferenceTable.id, conference.id));
		}

		expect((await listOpenCalls()).some((row) => row.slug === slug)).toBe(true);
	});
});

/**
 * The takeover (#330).
 *
 * The existing ownership tests pin the easy case — a stranger, with no
 * relationship to the submission at all — and every one of them passed while a
 * co-presenter could erase the person who proposed the talk. What distinguishes
 * these is that the caller is genuinely on the submission: the refusal has to
 * come from *which* speaker they are, not from whether they are one.
 */
describe('a co-presenter saving a proposal (#330)', () => {
	/** Casey proposes and names Dana, who has no account at that point. */
	async function proposalNamingDana(title: string, submit: boolean): Promise<number> {
		const saved = await saveSubmission(
			submitterId,
			slug,
			input({
				title,
				coSpeakers: [{ name: 'Dana Okonkwo', email: coSpeakerEmail, roleLabel: 'Co-presenter' }]
			}),
			{ submit }
		);
		if (!saved.ok) throw new Error('expected a saved proposal');
		return saved.submissionId;
	}

	/**
	 * Signing up under the address Casey entered. `claimProfilesForAccount` runs
	 * on the portal read, so this is the ordinary first thing Dana does — and the
	 * step that arms the takeover.
	 */
	async function danaSignsUpAndLooks(submissionId: number) {
		const rows = await mySubmissions(coSpeakerId);
		const row = rows.find((r) => r.id === submissionId);
		// Premise, not decoration: if Dana were never linked to the profile, every
		// assertion below would hold for the wrong reason.
		expect(row?.isPrimary).toBe(false);
	}

	/** The round trip the edit form and `update_proposal` both perform. */
	async function danaSaves(submissionId: number, title: string) {
		const editable = await editableDraft(coSpeakerId, submissionId);
		if (!editable) throw new Error('expected the co-presenter to be able to open it');
		return saveSubmission(
			coSpeakerId,
			slug,
			input({
				title,
				speaker: {
					name: 'Dana Okonkwo',
					sortName: 'Okonkwo, Dana',
					email: coSpeakerEmail,
					jobTitle: null,
					company: null,
					bio: null
				},
				coSpeakers: editable.draft.coSpeakers.map((co) => ({
					name: co.name,
					email: co.email || null,
					roleLabel: co.roleLabel || null
				}))
			}),
			{ submit: true, submissionId }
		);
	}

	async function speakersOn(submissionId: number) {
		return db
			.select({
				userId: speakerProfileTable.userId,
				isPrimary: submissionSpeakerTable.isPrimary
			})
			.from(submissionSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
			)
			.where(eq(submissionSpeakerTable.submissionId, submissionId));
	}

	it('leaves the talk with the person who proposed it', async () => {
		const id = await proposalNamingDana('Ours together', true);
		await danaSignsUpAndLooks(id);

		expect((await danaSaves(id, 'Ours together, reworded')).ok).toBe(true);

		const speakers = await speakersOn(id);
		expect(speakers).toHaveLength(2);
		expect(speakers.find((s) => s.userId === submitterId)?.isPrimary).toBe(true);
		// Dana stays on the talk: the edit is allowed, only the takeover is not.
		expect(speakers.find((s) => s.userId === coSpeakerId)?.isPrimary).toBe(false);

		// What the deletion actually cost the submitter, asserted where they would
		// have noticed it — their own proposal missing from their own portal.
		expect((await mySubmissions(submitterId)).some((row) => row.id === id)).toBe(true);
	});

	it('still sends the submitter their confirmation when the co-presenter hands it in', async () => {
		const id = await proposalNamingDana('Handed in by the other one', false);
		await danaSignsUpAndLooks(id);

		expect((await danaSaves(id, 'Handed in by the other one')).ok).toBe(true);

		// `queueReceipt` reads the speaker set after the write, so a submitter who
		// was deleted by that same write is not merely off the talk — they are not
		// told it went in.
		const mails = await db
			.select({ toEmail: emailLogTable.toEmail })
			.from(emailLogTable)
			.where(
				and(eq(emailLogTable.relatedId, id), eq(emailLogTable.template, 'submission_received'))
			);
		expect(new Set(mails.map((m) => m.toEmail))).toEqual(
			new Set([`${submitterId}@example.test`, coSpeakerEmail])
		);
	});

	it('cannot withdraw it — sharing a talk is not sharing the decision to pull it', async () => {
		const id = await proposalNamingDana('Not Dana’s to pull', false);
		await danaSignsUpAndLooks(id);

		expect(await withdrawSubmission(coSpeakerId, id)).toEqual({ ok: false, reason: 'not_found' });

		const [row] = await db
			.select({ status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, id));
		expect(row?.status).toBe('draft');

		// The same call from the submitter, so the refusal above is about which
		// speaker asked and not about the proposal being unwithdrawable.
		expect(await withdrawSubmission(submitterId, id)).toEqual({ ok: true });
	});
});

/**
 * The identity overwrite (#229, fault B).
 *
 * `speaker_profile.email` is a matching key, not a label: `upsertCoSpeaker`
 * resolves a co-presenter to whichever profile in the organization holds the
 * address. So the damage on prod was not only that the organizer's own profile
 * was renamed — it was that every later co-presenter entry naming that address
 * would have landed on their account.
 */
describe('stating somebody else’s address under "About you" (#229)', () => {
	/** Marcus, on the roster with no account of his own — the prod shape. */
	async function marcusOnTheRoster(): Promise<number> {
		const [existing] = await db
			.select({ id: speakerProfileTable.id })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.email, marcusEmail)
				)
			)
			.limit(1);
		if (existing) return existing.id;

		const [created] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId,
				name: 'Marcus Okafor',
				sortName: 'Okafor, Marcus',
				email: marcusEmail,
				jobTitle: 'Staff Developer Advocate',
				company: 'Cloudreach Labs'
			})
			.returning({ id: speakerProfileTable.id });
		return created.id;
	}

	function asMarcus(): SubmissionInput['speaker'] {
		return {
			name: 'Marcus Okafor',
			sortName: 'Okafor, Marcus',
			email: marcusEmail,
			jobTitle: 'Staff Developer Advocate',
			company: 'Cloudreach Labs',
			bio: null
		};
	}

	it('refuses, and names the field the submitter was reaching for', async () => {
		await marcusOnTheRoster();

		const result = await saveSubmission(
			jordanId,
			slug,
			input({ title: 'A talk Marcus is giving', speaker: asMarcus() }),
			{ submit: true }
		);

		if (result.ok || result.reason !== 'invalid') {
			throw new Error(`expected an invalid-field refusal, got ${JSON.stringify(result)}`);
		}
		// Named on the field the submitter typed into, and pointing at the thing
		// they were actually reaching for.
		expect(result.errors.speakerEmail).toMatch(/co-presenter/);

		// The point of the refusal: Jordan's account is not now Marcus.
		const mine = await db
			.select({ name: speakerProfileTable.name, email: speakerProfileTable.email })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.userId, jordanId));
		expect(mine.every((row) => row.name !== 'Marcus Okafor')).toBe(true);
		expect(mine.every((row) => row.email !== marcusEmail)).toBe(true);
	});

	it('sees through a capital letter, because that is what a person types', async () => {
		await marcusOnTheRoster();

		const shouted = { ...asMarcus(), email: marcusEmail.toUpperCase() };
		const result = await saveSubmission(
			jordanId,
			slug,
			input({ title: 'A talk MARCUS is giving', speaker: shouted }),
			{ submit: true }
		);

		if (result.ok || result.reason !== 'invalid') {
			throw new Error(`expected an invalid-field refusal, got ${JSON.stringify(result)}`);
		}
		expect(result.errors.speakerEmail).toMatch(/co-presenter/);

		// And the account that legitimately owns a capitalised address is not locked
		// out by the same widening — the exception has to match the same way.
		const mine = await db
			.select({ email: speakerProfileTable.email })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.userId, jordanId));
		expect(mine.every((row) => !sameAddress(row.email, marcusEmail))).toBe(true);
	});

	it('leaves the address where it was, so a co-presenter entry still finds Marcus', async () => {
		const marcusId = await marcusOnTheRoster();

		await saveSubmission(jordanId, slug, input({ title: 'Another try', speaker: asMarcus() }), {
			submit: false
		});

		// This is the consequence the refusal exists for. If Jordan's profile had
		// taken the address, `upsertCoSpeaker` would resolve Marcus to Jordan here
		// and put Jordan on somebody else's proposal.
		const saved = await saveSubmission(
			submitterId,
			slug,
			input({
				title: 'Presenting with Marcus',
				coSpeakers: [{ name: 'Marcus Okafor', email: marcusEmail, roleLabel: 'Co-presenter' }]
			}),
			{ submit: false }
		);
		if (!saved.ok) throw new Error('expected a saved draft');

		// Stated first, because it is what makes the next assertion mean anything:
		// with two profiles carrying the address, `upsertCoSpeaker` takes whichever
		// its `limit(1)` reaches, and landing on Marcus would prove nothing.
		const holders = await db
			.select({ id: speakerProfileTable.id })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.email, marcusEmail)
				)
			);
		expect(holders.map((row) => row.id)).toEqual([marcusId]);

		const speakers = await db
			.select({ profileId: submissionSpeakerTable.speakerProfileId })
			.from(submissionSpeakerTable)
			.where(eq(submissionSpeakerTable.submissionId, saved.submissionId));

		expect(speakers.map((row) => row.profileId)).toContain(marcusId);
	});

	it('still lets a speaker claim the profile an organizer made for them', async () => {
		// The case the rule must not break: the address is the account's own, and a
		// profile someone else created under it is exactly what claiming is for.
		await db.insert(speakerProfileTable).values({
			organizationId,
			name: 'Jordan Vale',
			sortName: 'Vale, Jordan',
			email: `${jordanId}@example.test`
		});

		const result = await saveSubmission(
			jordanId,
			slug,
			input({
				title: 'My own talk',
				speaker: {
					name: 'Jordan Vale',
					sortName: 'Vale, Jordan',
					// Stated in a different case than the account holds it. The widening
					// has to reach the exception too, or the guard locks people out of
					// their own address instead of protecting somebody else's.
					email: `${jordanId}@EXAMPLE.test`,
					jobTitle: null,
					company: null,
					bio: null
				}
			}),
			{ submit: false }
		);

		expect(result.ok).toBe(true);
		const mine = await db
			.select({ email: speakerProfileTable.email })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.userId, jordanId));
		// Claimed, not forked: one profile, carrying the account's own address.
		expect(mine).toHaveLength(1);
		expect(sameAddress(mine[0].email, `${jordanId}@example.test`)).toBe(true);
	});
});

describe('withdrawSubmission', () => {
	it('lets the speaker take a draft back, then refuses a second time', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Take this back' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a draft');

		expect(await withdrawSubmission(submitterId, saved.submissionId)).toEqual({ ok: true });

		const [row] = await db
			.select({ status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));
		expect(row?.status).toBe('withdrawn');

		expect(await withdrawSubmission(submitterId, saved.submissionId)).toEqual({
			ok: false,
			reason: 'decided'
		});
	});

	it('refuses a stranger the same way ownedSubmission does', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Not yours to pull' }), {
			submit: false
		});
		if (!saved.ok) throw new Error('expected a draft');

		expect(await withdrawSubmission(strangerId, saved.submissionId)).toEqual({
			ok: false,
			reason: 'not_found'
		});

		const [row] = await db
			.select({ status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, saved.submissionId));
		expect(row?.status).toBe('draft');
	});

	it('will not overwrite a decision that landed between the check and the write', async () => {
		const saved = await saveSubmission(submitterId, slug, input({ title: 'Already judged' }), {
			submit: true
		});
		if (!saved.ok) throw new Error('expected a submitted proposal');

		await db
			.update(submissionTable)
			.set({ status: 'accepted', decidedAt: new Date() })
			.where(eq(submissionTable.id, saved.submissionId));

		expect(await withdrawSubmission(submitterId, saved.submissionId)).toEqual({
			ok: false,
			reason: 'decided'
		});
	});
});
