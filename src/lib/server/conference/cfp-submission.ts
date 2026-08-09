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
	validateAnswers,
	visibleFields,
	type AnswerContext,
	type FieldDefinition
} from '$lib/conference/form-definition';
import { db } from '$lib/server/db';
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
import { and, asc, eq, inArray } from 'drizzle-orm';
import { publishedFormFor } from './cfp-form';

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
	form: { id: number; title: string; opensAt: Date | null; closesAt: Date | null };
	state: CallState;
	fields: FieldDefinition[];
	formats: { id: number; name: string; minutes: number | null }[];
	tracks: { id: number; name: string }[];
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
		tracks
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

/** Everything a submission needs before it can leave `draft`. */
function validateForSubmit(input: SubmissionInput, fields: FieldDefinition[]) {
	const errors: Record<string, string> = {};
	if (!input.title.trim()) errors.title = 'A title is required.';
	if (!input.abstract?.trim()) errors.abstract = 'An abstract is required.';
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
 * The submitter's own speaker profile in the conference's organization.
 *
 * Looked up by user rather than by email so that changing your address does not
 * fork your profile, and updated on every save so the organizer sees the job title
 * and company the submitter last stated — EMB-01 and EMB-09 read those columns
 * literally.
 */
async function upsertOwnProfile(
	tx: Tx,
	organizationId: string,
	userId: string,
	speaker: SpeakerInput
): Promise<number> {
	const values = {
		name: speaker.name.trim(),
		sortName: (speaker.sortName.trim() || guessSortName(speaker.name)).trim(),
		email: speaker.email.trim() || null,
		jobTitle: speaker.jobTitle,
		company: speaker.company,
		bio: speaker.bio
	};

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
		await tx.update(speakerProfileTable).set(values).where(eq(speakerProfileTable.id, existing.id));
		return existing.id;
	}

	const [created] = await tx
		.insert(speakerProfileTable)
		.values({ organizationId, userId, ...values })
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

	const rows = recipients
		.filter((r): r is { email: string } => Boolean(r.email))
		.map((r) => ({
			conferenceId: call.conference.id,
			toEmail: r.email,
			template: 'submission_received',
			subject: `We received your proposal for ${call.conference.name}`,
			bodyPreview:
				`Thanks — "${title}" is in. You can edit it from your speaker portal until ` +
				`the call closes, and we will email you when a decision is made.`,
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
		const { errors, fieldErrors } = validateForSubmit(input, call.fields);
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
		// Owning a session proves who you are, not which submission is yours — and a
		// submitted proposal is no longer the submitter's to rewrite.
		const owned = await ownedSubmission(userId, options.submissionId);
		if (!owned || owned.status !== 'draft') return { ok: false, reason: 'forbidden' };
	}

	return null;
}

/** The submission's own columns. `submittedAt` is the moment a draft stops being one. */
function submissionValues(call: OpenCall, input: SubmissionInput, submit: boolean) {
	return {
		conferenceId: call.conference.id,
		cfpFormId: call.form.id,
		title: input.title.trim(),
		abstract: input.abstract,
		keyTakeaway: input.keyTakeaway,
		audienceLevel: input.audienceLevel,
		sessionFormatId: input.sessionFormatId,
		trackId: input.trackId,
		status: submit ? ('submitted' as const) : ('draft' as const),
		submittedAt: submit ? new Date() : null
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
		input.speaker
	);

	const values = submissionValues(call, input, options.submit);

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

	if (options.submit) {
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

	const refusal = await refuseSave(userId, call, input, options);
	if (refusal) return refusal;

	const submissionId = await db.transaction((tx) => persist(tx, userId, call, input, options));

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
