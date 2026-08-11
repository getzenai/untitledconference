/**
 * The submitter's side of the call for papers.
 *
 * The organizer defines the form in `cfp-form.ts`; this reads that definition and
 * takes what comes back through it. Three things are deliberate:
 *
 *  1. **One definition of the form.** Visibility and validation come from
 *     `$lib/conference/form-definition`, the same module the organizer's preview
 *     renders through. A second implementation here would be a second chance for
 *     the form to demand something it never displayed.
 *  2. **Hidden answers are not stored.** Switch the session format and a field
 *     that no longer applies loses its answer. Keeping it would leave the
 *     submission carrying a reply to a question the form stopped asking, which
 *     the organizer would later read as fact.
 *  3. **A draft needs only a title** (CFP-07). Everything else is validated on
 *     the way to `submitted`, never on the way to `draft`.
 */
import {
	asks,
	fixedQuestionVisibility,
	type FixedQuestionVisibility
} from '$lib/conference/fixed-questions';
import {
	validateAnswers,
	visibleFields,
	type AnswerContext,
	type FieldDefinition
} from '$lib/conference/form-definition';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
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
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { publishedFormFor } from './cfp-form';
import { dispatchConferenceEmails } from './email-dispatcher';

/** Why the form is or is not accepting submissions right now (CFP-04, CFP-16). */
export type CallState = 'open' | 'not_yet_open' | 'closed';

export type OpenCall = {
	conference: {
		id: number;
		organizationId: string;
		slug: string;
		name: string;
		venue: string | null;
		startsOn: string | null;
		endsOn: string | null;
	};
	form: {
		id: number;
		title: string;
		description: string | null;
		opensAt: Date | null;
		closesAt: Date | null;
	};
	state: CallState;
	fields: FieldDefinition[];
	formats: { id: number; name: string; minutes: number | null }[];
	tracks: { id: number; name: string }[];
	/**
	 * Which built-in questions this call asks (#159), already resolved from the
	 * stored column.
	 *
	 * Resolved here rather than handed over raw so that the two pages rendering
	 * the form, and the submit handler validating it, cannot each parse it their
	 * own way. That is the same reason `visibleFields` is shared.
	 */
	fixed: FixedQuestionVisibility;
};

function callState(opensAt: Date | null, closesAt: Date | null, closed: boolean, now: Date) {
	if (closed) return 'closed' as const;
	if (opensAt && opensAt > now) return 'not_yet_open' as const;
	if (closesAt && closesAt <= now) return 'closed' as const;
	return 'open' as const;
}

/** The two axes a proposal is filed under. Both drive CFP-02 conditions. */
async function loadAxes(conferenceId: number) {
	const [formats, tracks] = await Promise.all([
		db
			.select({
				id: sessionFormatTable.id,
				name: sessionFormatTable.name,
				minutes: sessionFormatTable.minutes
			})
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position)),
		db
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position))
	]);
	return { formats, tracks };
}

/**
 * The call as a submitter sees it, or null when there is nothing public to see.
 *
 * Null covers "no such conference", "conference not published" and "form still a
 * draft" alike — the same reasoning as `requireOrganizer` returning 404 for both
 * missing and forbidden: a distinct answer would confirm that a slug exists.
 *
 * A closed call is NOT null. It is a real, readable page that says the call has
 * closed, which is the state CFP-16 grades.
 */
export async function openCall(slug: string, now = new Date()): Promise<OpenCall | null> {
	const [conference] = await db
		.select({
			id: conferenceTable.id,
			organizationId: conferenceTable.organizationId,
			slug: conferenceTable.slug,
			name: conferenceTable.name,
			venue: conferenceTable.venue,
			startsOn: conferenceTable.startsOn,
			endsOn: conferenceTable.endsOn
		})
		.from(conferenceTable)
		.where(and(eq(conferenceTable.slug, slug), eq(conferenceTable.status, 'published')))
		.limit(1);

	if (!conference) return null;

	const published = await publishedFormFor(conference.id);
	if (!published) return null;

	const { formats, tracks } = await loadAxes(conference.id);

	return {
		conference,
		form: {
			id: published.form.id,
			title: published.form.title,
			description: published.form.description,
			opensAt: published.form.opensAt,
			closesAt: published.form.closesAt
		},
		state: callState(
			published.form.opensAt,
			published.form.closesAt,
			published.form.status === 'closed',
			now
		),
		fields: published.fields,
		formats,
		tracks,
		fixed: fixedQuestionVisibility(published.form.hiddenFixedFields)
	};
}

/**
 * Just enough about the call for the public navigation to link to it.
 *
 * Its own query rather than a flag on `openCall`, because this runs on every
 * public page and `openCall` loads formats, tracks and every field — a cost the
 * agenda has no reason to pay to render one tab.
 */
export async function callSummary(
	slug: string,
	now = new Date()
): Promise<{ state: CallState; closesAt: Date | null } | null> {
	const [row] = await db
		.select({
			status: cfpFormTable.status,
			opensAt: cfpFormTable.opensAt,
			closesAt: cfpFormTable.closesAt
		})
		.from(cfpFormTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, cfpFormTable.conferenceId))
		.where(
			and(
				eq(conferenceTable.slug, slug),
				eq(conferenceTable.status, 'published'),
				inArray(cfpFormTable.status, ['published', 'closed'])
			)
		)
		.orderBy(asc(cfpFormTable.id))
		.limit(1);

	if (!row) return null;
	return {
		state: callState(row.opensAt, row.closesAt, row.status === 'closed', now),
		closesAt: row.closesAt
	};
}

export type SpeakerInput = {
	name: string;
	sortName: string;
	email: string;
	jobTitle: string | null;
	company: string | null;
	bio: string | null;
};

export type CoSpeakerInput = { name: string; email: string | null; roleLabel: string | null };

export type SubmissionInput = {
	title: string;
	abstract: string | null;
	keyTakeaway: string | null;
	audienceLevel: string | null;
	sessionFormatId: number | null;
	trackId: number | null;
	answers: Record<number, string>;
	speaker: SpeakerInput;
	coSpeakers: CoSpeakerInput[];
};

export type SaveResult =
	| { ok: true; submissionId: number; status: 'draft' | 'submitted' }
	| { ok: false; reason: 'closed' | 'not_found' | 'forbidden' }
	| {
			ok: false;
			reason: 'invalid';
			errors: Record<string, string>;
			fieldErrors: Record<number, string>;
	  };

/**
 * `sortName` is asked for, not derived — but it needs a starting point, and this is
 * a guess the submitter can overwrite.
 *
 * It is right for "Zoe Adler" and wrong for "Ng Wei Ling", which is exactly why the
 * form shows the result instead of applying it silently. See the note on
 * `speaker_profile.sortName`.
 */
export function guessSortName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length < 2) return name.trim();
	const last = parts[parts.length - 1];
	return `${last}, ${parts.slice(0, -1).join(' ')}`;
}

/**
 * The proposal with every answer to a question this call does not ask treated as
 * if it had never been sent (#159).
 *
 * The same rule the conditional fields already follow, applied to the built-in
 * ones: a control that was not rendered is inconsequential on the server. A POST
 * is not a form, and nothing stops one carrying the field the screen no longer
 * draws.
 *
 * **Ignored means not written, never written as empty.** The two are easy to
 * confuse and only one is right: an organizer who removes the abstract has said
 * what their form asks from now on, not that the abstracts already sitting on
 * submitted proposals should be deleted the next time each speaker fixes a typo.
 * The builder's own wording promises exactly that — "answers already given to it
 * stay on their submissions" — so the columns for unasked questions are left out
 * of the write entirely (`submissionValues`), and the speaker's profile columns
 * are skipped rather than cleared (`statedProfileFields`).
 *
 * What is blanked here is what has no column to be left alone: a sort key falls
 * back to the guess made from the name, and co-presenters nobody was asked for
 * are simply not there.
 */
function askedOnly(input: SubmissionInput, fixed: FixedQuestionVisibility): SubmissionInput {
	return {
		...input,
		speaker: {
			...input.speaker,
			sortName: asks(fixed, 'speakerSortName') ? input.speaker.sortName : ''
		},
		coSpeakers: asks(fixed, 'coSpeakers') ? input.coSpeakers : []
	};
}

/** Everything a submission needs before it can leave `draft`. */
function validateForSubmit(
	input: SubmissionInput,
	fields: FieldDefinition[],
	fixed: FixedQuestionVisibility
) {
	const errors: Record<string, string> = {};
	if (!input.title.trim()) errors.title = 'A title is required.';
	// A question that is not asked is never required. The abstract is the only
	// built-in that both is required and can be removed — the other two required
	// ones identify the speaker and cannot be.
	if (asks(fixed, 'abstract') && !input.abstract?.trim()) {
		errors.abstract = 'An abstract is required.';
	}
	if (!input.speaker.name.trim()) errors.speakerName = 'Your name is required.';
	if (!input.speaker.email.trim()) errors.speakerEmail = 'An email address is required.';

	const ctx: AnswerContext = {
		sessionFormatId: input.sessionFormatId,
		trackId: input.trackId,
		answers: input.answers
	};
	// Only the visible fields are validated. A hidden field is never required —
	// the smallest rule in the shared module, and the one a second implementation
	// would get wrong.
	return { errors, fieldErrors: validateAnswers(visibleFields(fields, ctx), ctx) };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Only the profile columns the submitter actually filled in.
 *
 * A draft is allowed to carry nothing but a title (CFP-07), so a blank "About
 * you" on the second draft-save must not wipe the name, company and bio the
 * first one recorded — the organizer would be looking at a nameless speaker with
 * no way to know why.
 */
function statedProfileFields(
	speaker: SpeakerInput,
	submitting: boolean,
	fixed: FixedQuestionVisibility
) {
	const stated: Record<string, string | null> = {};
	const name = speaker.name.trim();
	const sortName = speaker.sortName.trim();

	if (name) stated.name = name;
	if (sortName || name) stated.sortName = sortName || guessSortName(name);
	if (speaker.email.trim()) stated.email = speaker.email.trim();

	// On a submit, an empty optional field is a decision: someone cleared their
	// company and meant it. On a draft-save it is just an unfinished form, and
	// treating it as a decision would erase what the previous save recorded.
	// `name`, `sortName` and `email` are never cleared — they are required to
	// submit at all, so empty there is a form error, not an intention.
	//
	// A question this call does not ask (#159) is never a decision either. The
	// speaker profile belongs to the organization, not to one call: a conference
	// that stops asking for a company would otherwise erase the company its
	// speakers gave on the roster or on another call's form.
	for (const key of ['jobTitle', 'company', 'bio'] as const) {
		if (!asks(fixed, `speaker${key[0].toUpperCase()}${key.slice(1)}`)) continue;
		const value = speaker[key];
		if (value) stated[key] = value;
		else if (submitting) stated[key] = null;
	}

	return stated;
}

/**
 * The one profile in this organization that already stands for this person, with
 * no account attached to it yet.
 *
 * The organizer's roster (`upsertProfileForAdd`) and the co-speaker path
 * (`upsertCoSpeaker`) both identify a speaker by `(organization, email)` and both
 * leave `userId` null, because neither knows whether that person has signed up.
 * Looking a submitter up by user id alone therefore misses the profile that was
 * created *for* them, and the submitter gets a second one.
 *
 * The address compared here is the account's, never the one typed into the
 * proposal form: the form field is free text in the same request, so matching on
 * it would let anyone claim an invited speaker by typing their address. Matching
 * the account's address means the claim is only as strong as the deployment's
 * signup checks — with `REQUIRE_EMAIL_VERIFICATION` on, it is proof of control of
 * that mailbox.
 *
 * Oldest first, so two unclaimed duplicates resolve the same way on every call.
 */
async function unclaimedProfileForEmail(
	tx: Tx,
	organizationId: string,
	email: string | null
): Promise<number | null> {
	if (!email) return null;

	const [row] = await tx
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, organizationId),
				eq(speakerProfileTable.email, email),
				isNull(speakerProfileTable.userId)
			)
		)
		.orderBy(asc(speakerProfileTable.id))
		.limit(1);

	return row?.id ?? null;
}

/**
 * The submitter's own speaker profile in the conference's organization.
 *
 * Looked up by user first so that changing your address does not fork your
 * profile, then by the account's address so that being invited before you signed
 * up does not fork it either. Updated on every save so the organizer sees the job
 * title and company the submitter last stated — EMB-01 and EMB-09 read those
 * columns literally.
 */
async function upsertOwnProfile(
	tx: Tx,
	organizationId: string,
	userId: string,
	speaker: SpeakerInput,
	submitting: boolean,
	fixed: FixedQuestionVisibility
): Promise<number> {
	const stated = statedProfileFields(speaker, submitting, fixed);

	const [existing] = await tx
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, organizationId),
				eq(speakerProfileTable.userId, userId)
			)
		)
		.limit(1);

	if (existing) {
		if (Object.keys(stated).length > 0) {
			await tx
				.update(speakerProfileTable)
				.set(stated)
				.where(eq(speakerProfileTable.id, existing.id));
		}
		return existing.id;
	}

	// `name` and `sortName` are NOT NULL, so a first profile needs something even
	// when the form was left empty. The account is the honest fallback: it is who
	// this person already told us they are.
	const [account] = await tx
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const fallbackName = account?.name?.trim() || account?.email || 'Unnamed speaker';

	const claimable = await unclaimedProfileForEmail(tx, organizationId, account?.email ?? null);
	if (claimable !== null) {
		// Claim it rather than fork it. Identity columns the organizer typed are left
		// alone — only `userId` and whatever this submission stated are written, the
		// same restraint `upsertProfileForAdd` shows when it reuses a profile.
		await tx
			.update(speakerProfileTable)
			.set({ userId, ...stated })
			.where(eq(speakerProfileTable.id, claimable));
		return claimable;
	}

	const [created] = await tx
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId,
			name: fallbackName,
			sortName: guessSortName(fallbackName),
			email: account?.email ?? null,
			...stated
		})
		.returning({ id: speakerProfileTable.id });
	return created.id;
}

/**
 * Co-presenters, as profiles without accounts.
 *
 * ABS-11 checks that a co-author added at submission time survives into the
 * organizer's views, so these are real `speaker_profile` rows from the start, not
 * a text field on the submission.
 */
async function upsertCoSpeaker(
	tx: Tx,
	organizationId: string,
	co: CoSpeakerInput
): Promise<number> {
	const email = co.email?.trim() || null;

	if (email) {
		const [existing] = await tx
			.select({ id: speakerProfileTable.id })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.email, email)
				)
			)
			.limit(1);
		if (existing) return existing.id;
	}

	const [created] = await tx
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: co.name.trim(),
			sortName: guessSortName(co.name),
			email
		})
		.returning({ id: speakerProfileTable.id });
	return created.id;
}

/** Answers to the fields the form actually showed, and nothing else. */
async function writeAnswers(
	tx: Tx,
	submissionId: number,
	fields: FieldDefinition[],
	input: SubmissionInput
) {
	const ctx: AnswerContext = {
		sessionFormatId: input.sessionFormatId,
		trackId: input.trackId,
		answers: input.answers
	};
	const shown = visibleFields(fields, ctx);

	await tx
		.delete(submissionAnswerTable)
		.where(eq(submissionAnswerTable.submissionId, submissionId));

	const rows = shown
		.map((field) => ({
			submissionId,
			formFieldId: field.id,
			value: input.answers[field.id] ?? null
		}))
		.filter((row) => row.value !== null && row.value !== '');

	if (rows.length > 0) await tx.insert(submissionAnswerTable).values(rows);
}

/** The submitter first, then co-presenters in the order they were entered. */
async function writeSpeakers(
	tx: Tx,
	submissionId: number,
	organizationId: string,
	ownProfileId: number,
	coSpeakers: CoSpeakerInput[]
) {
	await tx
		.delete(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.submissionId, submissionId));

	await tx
		.insert(submissionSpeakerTable)
		.values({ submissionId, speakerProfileId: ownProfileId, isPrimary: true, position: 0 });

	let position = 1;
	for (const co of coSpeakers) {
		if (!co.name.trim()) continue;
		const profileId = await upsertCoSpeaker(tx, organizationId, co);
		if (profileId === ownProfileId) continue;
		await tx.insert(submissionSpeakerTable).values({
			submissionId,
			speakerProfileId: profileId,
			isPrimary: false,
			roleLabel: co.roleLabel,
			position: position++
		});
	}
}

/**
 * The confirmation (CFP-08).
 *
 * A row in `email_log`, because the judging agent has no inbox — see the note on
 * that table. Queued for every speaker with an address, so a co-presenter learns
 * they were put on a talk.
 */
async function queueReceipt(
	tx: Tx,
	call: OpenCall,
	submissionId: number,
	title: string,
	profileIds: number[]
) {
	const recipients = await tx
		.select({ email: speakerProfileTable.email })
		.from(speakerProfileTable)
		.where(inArray(speakerProfileTable.id, profileIds));

	// Two profiles can carry the same address — someone who submits and also adds
	// themselves as a co-presenter. One proposal, one receipt.
	const addresses = [...new Set(recipients.map((r) => r.email).filter((e): e is string => !!e))];

	const rows = addresses
		.map((email) => ({ email }))
		.map((r) => ({
			conferenceId: call.conference.id,
			toEmail: r.email,
			template: 'submission_received',
			subject: `We received your proposal for ${call.conference.name}`,
			// Says only what is true. A submitted proposal is locked — `refuseSave`
			// requires `draft`, and there is no unsubmit path — so promising an edit
			// here would be the same copy-ahead-of-code defect twice over.
			bodyPreview:
				`Thanks — "${title}" is in. You can view it in your speaker portal, and we ` +
				`will email you when a decision is made.`,
			relatedType: 'submission',
			relatedId: submissionId
		}));

	if (rows.length > 0) await tx.insert(emailLogTable).values(rows);
}

/**
 * Everything that must hold before a write is attempted, as one answer.
 *
 * Separated from the write so the rules read as rules: null means "go ahead".
 */
async function refuseSave(
	userId: string,
	call: OpenCall,
	input: SubmissionInput,
	options: { submit: boolean; submissionId?: number }
): Promise<SaveResult | null> {
	// CFP-16: once the call is shut, it is shut for edits too, not just for new
	// proposals. A draft left unfinished stays readable; it stops being writable.
	if (call.state !== 'open') return { ok: false, reason: 'closed' };

	if (options.submit) {
		const { errors, fieldErrors } = validateForSubmit(input, call.fields, call.fixed);
		if (Object.keys(errors).length > 0 || Object.keys(fieldErrors).length > 0) {
			return { ok: false, reason: 'invalid', errors, fieldErrors };
		}
	} else if (!input.title.trim()) {
		return {
			ok: false,
			reason: 'invalid',
			errors: { title: 'A title is required.' },
			fieldErrors: {}
		};
	}

	if (options.submissionId !== undefined) {
		// Owning a session proves who you are, not which submission is yours.
		//
		// A proposal stays the submitter's to rewrite for as long as the call is
		// open — that is CFP-07, and the call's own copy promises it. What ends the
		// right is a decision, not the act of submitting: once a proposal has been
		// accepted, rejected or waitlisted, the organizers have read the words they
		// judged and those words stop moving. `withdrawn` is out for the same
		// reason from the other side.
		//
		// The conference check is the third condition and the least obvious: without
		// it, a draft belonging to conference A could be POSTed to B's call with its
		// id, and `persist` would rewrite `conferenceId` and `cfpFormId` — moving a
		// proposal between tenants. No UI does that; the exported API allows it, and
		// the API is what the tests legitimise.
		const owned = await ownedSubmission(userId, options.submissionId);
		const editable =
			owned &&
			(owned.status === 'draft' || owned.status === 'submitted' || owned.status === 'in_review') &&
			owned.conferenceId === call.conference.id;
		if (!editable) return { ok: false, reason: 'forbidden' };
	}

	return null;
}

/** What the row said before this save, for the two columns an edit must not reset. */
type PriorState = {
	status: (typeof submissionTable.$inferSelect)['status'];
	submittedAt: Date | null;
} | null;

/**
 * In front of the organizers already — submitted, or the review has begun. Both
 * keep the speaker's right to edit while the call is open; neither is a draft.
 */
function alreadyIn(prior: PriorState): boolean {
	return prior?.status === 'submitted' || prior?.status === 'in_review';
}

/**
 * The submission's own columns. `submittedAt` is the moment a draft stops being one.
 *
 * Two things an edit must not do to a proposal that is already in, and both were
 * possible while only drafts were editable, so neither had a way to happen:
 *
 * - **Demote it.** A draft-save aimed at a submitted proposal would set `draft`,
 *   quietly withdrawing it from the organizer's list through a side door.
 * - **Re-stamp it.** `submittedAt` is the receipt the speaker was shown and the
 *   date the organizer sorts by. Rewording a sentence does not move the moment
 *   the proposal arrived.
 */
function submissionValues(
	call: OpenCall,
	input: SubmissionInput,
	submit: boolean,
	prior: PriorState = null
) {
	const arrived = alreadyIn(prior);

	// A question this call does not ask contributes no column at all (#159). On an
	// insert that leaves it null, which is what an unasked question means; on an
	// update it leaves whatever the proposal already said, which is what the
	// builder promised when the organizer removed the question.
	const asked = <T>(key: string, value: T) =>
		asks(call.fixed, key) ? ({ [key]: value } as Record<string, T>) : {};

	return {
		conferenceId: call.conference.id,
		cfpFormId: call.form.id,
		title: input.title.trim(),
		...asked('abstract', input.abstract),
		...asked('keyTakeaway', input.keyTakeaway),
		...asked('audienceLevel', input.audienceLevel),
		...asked('sessionFormatId', input.sessionFormatId),
		...asked('trackId', input.trackId),
		// An edit keeps whatever standing the proposal already has — `in_review`
		// stays `in_review`, `submitted` stays `submitted`. Only a first submit
		// moves a draft forward.
		status: arrived ? prior!.status : submit ? ('submitted' as const) : ('draft' as const),
		submittedAt: arrived ? prior!.submittedAt : submit ? new Date() : null
	};
}

/** The write itself, once `refuseSave` has agreed to it. */
async function persist(
	tx: Tx,
	userId: string,
	call: OpenCall,
	input: SubmissionInput,
	options: { submit: boolean; submissionId?: number }
): Promise<number> {
	const ownProfileId = await upsertOwnProfile(
		tx,
		call.conference.organizationId,
		userId,
		input.speaker,
		options.submit,
		call.fixed
	);

	// Read inside the transaction rather than reusing what `refuseSave` saw: the
	// two columns this protects are the ones being written a line later.
	const [prior] = options.submissionId
		? await tx
				.select({ status: submissionTable.status, submittedAt: submissionTable.submittedAt })
				.from(submissionTable)
				.where(eq(submissionTable.id, options.submissionId))
				.limit(1)
		: [];

	const values = submissionValues(call, input, options.submit, prior ?? null);
	const arrived = alreadyIn(prior ?? null);

	let id = options.submissionId;
	if (id === undefined) {
		const [created] = await tx
			.insert(submissionTable)
			.values(values)
			.returning({ id: submissionTable.id });
		id = created.id;
	} else {
		await tx.update(submissionTable).set(values).where(eq(submissionTable.id, id));
	}

	await writeAnswers(tx, id, call.fields, input);
	await writeSpeakers(tx, id, call.conference.organizationId, ownProfileId, input.coSpeakers);

	// Only the arrival gets a receipt. An edit is not a new proposal, and mailing
	// every co-speaker again on each wording change would train them to ignore it.
	if (options.submit && !arrived) {
		const speakers = await tx
			.select({ id: submissionSpeakerTable.speakerProfileId })
			.from(submissionSpeakerTable)
			.where(eq(submissionSpeakerTable.submissionId, id));
		await queueReceipt(
			tx,
			call,
			id,
			values.title,
			speakers.map((sp) => sp.id)
		);
	}

	return id;
}

/**
 * Creates or updates one submission.
 *
 * The whole write is one transaction: a proposal that exists without its speakers,
 * or a receipt for a submission that was never stored, would each be worse than a
 * failed save the submitter can retry.
 */
export async function saveSubmission(
	userId: string,
	slug: string,
	input: SubmissionInput,
	options: { submit: boolean; submissionId?: number }
): Promise<SaveResult> {
	const call = await openCall(slug);
	if (!call) return { ok: false, reason: 'not_found' };

	// Scrubbed once, at the door, so validation and the write see the same
	// proposal. Anything answering a question this call does not ask is gone from
	// here on.
	const asked = askedOnly(input, call.fixed);

	const refusal = await refuseSave(userId, call, asked, options);
	if (refusal) return refusal;

	const submissionId = await db.transaction((tx) => persist(tx, userId, call, asked, options));
	if (options.submit) await dispatchConferenceEmails(call.conference.id);

	return { ok: true, submissionId, status: options.submit ? 'submitted' : 'draft' };
}

/** One submission, only if the signed-in user is a speaker on it. */
export async function ownedSubmission(userId: string, submissionId: number) {
	const [row] = await db
		.select({
			id: submissionTable.id,
			conferenceId: submissionTable.conferenceId,
			status: submissionTable.status
		})
		.from(submissionTable)
		.innerJoin(submissionSpeakerTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(and(eq(submissionTable.id, submissionId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	return row ?? null;
}
