/**
 * A conference with days and a full tray, for E2E specs.
 *
 * The agenda needs three things before it renders a grid at all: a conference,
 * at least one day, and something waiting to be scheduled. Two of those cannot
 * be produced through the UI today — no route in the app writes a
 * `conference_day` row (#86), and the tray fills from *accepted* submissions,
 * which would mean walking CFP → submission → review → decision in every spec
 * that wants a board.
 *
 * So this endpoint is the shortcut for exactly those two, and deliberately not
 * for anything else. **It creates no rooms.** The room list is the surface the
 * agenda spec exists to prove; if the rooms came from here, the spec would be
 * checking this file rather than the product.
 *
 * The whole `/api/v1/test` prefix is refused with 403 unless
 * `ENABLE_TEST_ENDPOINTS=true` — see `isTestEnvironment` in `hooks.server.ts`.
 * That gate is the only thing keeping this out of production, so nothing here
 * may loosen it.
 */
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceSpeakerTable,
	conferenceTable,
	membershipTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

type FixtureRequest = {
	/** Whose organization the conference belongs to. */
	userId: string;
	/** Unique per spec run — the caller owns uniqueness, not this endpoint. */
	slug: string;
	name?: string;
	/** ISO calendar dates. One day is enough for a grid; two exercise the tabs. */
	days?: string[];
	/** Titles of the submissions that should land in the tray (or the table). */
	sessions?: string[];
	/**
	 * Status for every session in this fixture. Defaults to `accepted` so the
	 * agenda tray still fills the way it always has. Specs that exercise the
	 * still-to-review filter pass `submitted`: accepted talks are decisions, not
	 * review work, and would never show under that filter.
	 */
	sessionStatus?: 'submitted' | 'in_review' | 'accepted';
	/**
	 * Make this user the speaker on every session, and give them the portal
	 * (#495).
	 *
	 * The speaker portal needs a speaker profile bound to an account, a roster
	 * row, and a participation task. None of the three can be produced through
	 * the UI: acceptance writes the roster, and the task comes from an
	 * organizer's template run. Same shortcut, same reason as the days.
	 */
	speakerUserId?: string;
	/**
	 * Which of those titles already carry a handed-in review (#122).
	 *
	 * Same reason as the days: a review cannot be produced through the UI without
	 * walking plan → round → scorecard → assignment → submit in every spec that
	 * wants one reviewed talk. The reviews sort is only worth testing against a
	 * pile where some are and some are not, and this is the cheapest honest way
	 * to have both.
	 */
	reviewed?: string[];
	/**
	 * Whether the round those reviews sit in hides its reviewers from each other.
	 *
	 * A blind round is the case where the organizer's page used to print
	 * "Reviewer 1" beside the same person's name (#416), and it cannot be reached
	 * through the UI without walking plan → round → scorecard in the spec.
	 */
	blindReview?: boolean;
	/**
	 * Tracks to create, the first of which is put on the first session.
	 *
	 * A filter needs something to filter by AND something to leave out, so one
	 * track on one of several submissions is the smallest fixture that can tell a
	 * working track filter from one that does nothing.
	 */
	tracks?: string[];
	/**
	 * File-kind CFP answers on the first session (#423).
	 *
	 * A file field cannot be produced through the public form without walking
	 * CFP editor → publish → submit, and the preview spec only needs the
	 * answers already sitting on a talk the reviewer can open.
	 */
	attachments?: { label: string; url: string }[];
	/**
	 * Free-text CFP answers on the first session (#477).
	 *
	 * The form has no link field — "Link to a recording" is a text question, and
	 * the answer that has to become clickable is the string a submitter typed.
	 */
	textAnswers?: { label: string; value: string }[];
	/**
	 * Files already handed in on speaker materials (#423).
	 *
	 * A deliverable cannot be produced through the UI without walking
	 * acceptance → task template → portal upload, and the organizer preview
	 * spec only needs the rows sitting on `/content/files`.
	 */
	contentFiles?: { filename: string; contentType: string }[];
};

const DEFAULT_DAYS = ['2028-05-10', '2028-05-11'];
const DEFAULT_SESSIONS = ['Fixture Talk A', 'Fixture Talk B'];

/** The organization the fixture's conference belongs to, or null. */
async function organizationOf(userId: string): Promise<string | null> {
	const [seat] = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId))
		.limit(1);

	return seat?.organizationId ?? null;
}

/** The conference's tracks, in the order they were asked for. */
async function addTracks(conferenceId: number, names: string[]): Promise<number[]> {
	if (names.length === 0) return [];

	const rows = await db
		.insert(trackTable)
		.values(names.map((name, position) => ({ conferenceId, name, position })))
		.returning({ id: trackTable.id });

	return rows.map((row) => row.id);
}

/**
 * One submission with a speaker on it.
 *
 * Default status is `accepted` with no placement row: `backfillTray` in the
 * agenda load turns exactly that state into a tray entry, which is the path a
 * real acceptance takes. Inserting a placement here directly would skip it.
 * Callers that need live-pipeline rows (still-to-review) pass a different status.
 */
async function addSession(
	conferenceId: number,
	organizationId: string,
	title: string,
	index: number,
	trackId: number | null = null,
	status: 'submitted' | 'in_review' | 'accepted' = 'accepted',
	speakerProfileId: number | null = null
): Promise<{ submissionId: number; speakerProfileId: number }> {
	const decided = status === 'accepted' ? new Date() : null;
	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId, title, status, decidedAt: decided, trackId })
		.returning();

	// One person can hold several accepted talks, and `speakerUserId` fixtures
	// depend on that: the withdrawal counts talks per profile, so a profile per
	// session would make every speaker a one-talk speaker.
	const profileId =
		speakerProfileId ??
		(
			await db
				.insert(speakerProfileTable)
				.values({
					organizationId,
					name: `Fixture Speaker ${index + 1}`,
					sortName: `Speaker ${index + 1}`
				})
				.returning()
		)[0].id;

	await db.insert(submissionSpeakerTable).values({
		submissionId: submission.id,
		speakerProfileId: profileId,
		isPrimary: true,
		position: 0
	});

	return { submissionId: submission.id, speakerProfileId: profileId };
}

/**
 * The roster row and the one task the speaker portal is about (#495).
 *
 * `status: 'invited'` is what acceptance writes: the organizer's assumption,
 * not the speaker's answer. The task title is matched by
 * `isParticipationTaskTitle`, which is deliberately exact.
 */
async function addParticipationTask(
	conferenceId: number,
	speakerProfileId: number,
	submissionId: number
): Promise<void> {
	await db
		.insert(conferenceSpeakerTable)
		.values({ conferenceId, speakerProfileId, status: 'invited' });
	await db.insert(taskTable).values({
		conferenceId,
		speakerProfileId,
		submissionId,
		title: 'Confirm participation',
		kind: 'action'
	});
}

/**
 * One handed-in review per named title, under this conference's own plan (#122).
 *
 * No scores: the reviews order counts reviews with `status = 'submitted'`, and
 * a scorecard would only add rows nothing here reads. The reviewer is the
 * organizer themselves, which no rule forbids — they are not a speaker on any
 * of these.
 */
async function addSubmittedReviews(
	conferenceId: number,
	reviewerUserId: string,
	titles: string[],
	blind = false
): Promise<void> {
	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId, name: 'Fixture plan' })
		.returning();
	const [round] = await db
		.insert(reviewRoundTable)
		.values({
			evaluationPlanId: plan.id,
			name: 'Fixture round',
			position: 0,
			anonymized: blind
		})
		.returning();

	// The review rows are not a seat. `/review/[slug]` 404s without one.
	await db.insert(membershipTable).values({
		userId: reviewerUserId,
		role: 'reviewer',
		scopeType: 'conference',
		scopeId: conferenceId
	});

	const rows = await db
		.select({ id: submissionTable.id, title: submissionTable.title })
		.from(submissionTable)
		.where(eq(submissionTable.conferenceId, conferenceId));

	const wanted = new Set(titles);
	const reviewed = rows.filter((row) => wanted.has(row.title));
	if (reviewed.length === 0) return;

	await db.insert(reviewTable).values(
		reviewed.map((row) => ({
			reviewRoundId: round.id,
			submissionId: row.id,
			reviewerUserId,
			status: 'submitted' as const,
			submittedAt: new Date()
		}))
	);
}

type Fixture = {
	userId: string;
	slug: string;
	name: string;
	days: string[];
	sessions: string[];
	sessionStatus: 'submitted' | 'in_review' | 'accepted';
	speakerUserId: string | null;
	reviewed: string[];
	blindReview: boolean;
	tracks: string[];
	attachments: { label: string; url: string }[];
	textAnswers: { label: string; value: string }[];
	contentFiles: { filename: string; contentType: string }[];
};

function orEmpty<T>(items: T[] | undefined): T[] {
	return items ?? [];
}

/** Everything defaulted, so the handler below reads as a sequence of writes. */
function withDefaults(body: FixtureRequest): Fixture | null {
	if (!body?.userId || !body?.slug) return null;

	return {
		userId: body.userId,
		slug: body.slug,
		name: body.name ?? 'Fixture Conference',
		days: body.days ?? DEFAULT_DAYS,
		sessions: body.sessions ?? DEFAULT_SESSIONS,
		sessionStatus: body.sessionStatus ?? 'accepted',
		speakerUserId: body.speakerUserId ?? null,
		reviewed: orEmpty(body.reviewed),
		blindReview: body.blindReview ?? false,
		tracks: orEmpty(body.tracks),
		attachments: orEmpty(body.attachments),
		textAnswers: orEmpty(body.textAnswers),
		contentFiles: orEmpty(body.contentFiles)
	};
}

/**
 * Every session of this fixture, and the speaker portal when one is asked for.
 *
 * Its own function rather than a loop in the handler: a fixture endpoint that
 * grows past the linter's size limits stops being the readable shortcut it is
 * meant to be.
 */
async function addSessions(
	conferenceId: number,
	organizationId: string,
	fixture: Fixture,
	trackIds: number[]
): Promise<number | null> {
	// One profile for the whole fixture when a speaker is named, so their talks
	// count as one person's — the withdrawal dialog counts talks per profile.
	const speakerProfileId = fixture.speakerUserId
		? (
				await db
					.insert(speakerProfileTable)
					.values({
						organizationId,
						userId: fixture.speakerUserId,
						name: 'Fixture Speaker',
						sortName: 'Speaker, Fixture'
					})
					.returning()
			)[0].id
		: null;

	let firstSubmissionId: number | null = null;

	for (const [index, title] of fixture.sessions.entries()) {
		// Only the first session gets the first track, so a filter that ignores its
		// parameter and returns everything is distinguishable from one that works.
		const added = await addSession(
			conferenceId,
			organizationId,
			title,
			index,
			index === 0 ? (trackIds[0] ?? null) : null,
			fixture.sessionStatus,
			speakerProfileId
		);

		// One participation answer covers the whole event, so one task on the first
		// session is the shape the portal really has.
		if (index === 0) firstSubmissionId = added.submissionId;

		if (speakerProfileId && index === 0) {
			await addParticipationTask(conferenceId, speakerProfileId, added.submissionId);
		}
	}

	return firstSubmissionId;
}

/**
 * CFP answers already sitting on one talk, so a spec can read them without
 * walking CFP editor → publish → submit (#423, #477).
 *
 * One form for all of them: two calls would leave the talk answering two
 * different calls, which is not a shape the product can produce.
 */
async function addAnswers(
	conferenceId: number,
	submissionId: number,
	answers: { label: string; value: string; kind: 'file' | 'short_text' }[]
): Promise<void> {
	if (answers.length === 0) return;

	const [form] = await db
		.insert(cfpFormTable)
		.values({ conferenceId, title: 'Fixture call', status: 'published' })
		.returning({ id: cfpFormTable.id });

	const fields = await db
		.insert(formFieldTable)
		.values(
			answers.map((answer, position) => ({
				cfpFormId: form.id,
				label: answer.label,
				kind: answer.kind,
				position
			}))
		)
		.returning({ id: formFieldTable.id });

	await db.insert(submissionAnswerTable).values(
		fields.map((field, i) => ({
			submissionId,
			formFieldId: field.id,
			value: answers[i].value
		}))
	);
}

/**
 * One speaker, one file-request per file, so the organizer library has
 * something to open without walking the portal (#423).
 *
 * Two files on one task would be versions of each other; the library hides
 * superseded rows by default, and the spec needs both names on the page.
 */
async function addContentFiles(
	conferenceId: number,
	organizationId: string,
	files: { filename: string; contentType: string }[]
): Promise<void> {
	if (files.length === 0) return;

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Ada Bennett', sortName: 'Bennett, Ada' })
		.returning({ id: speakerProfileTable.id });

	for (const [index, file] of files.entries()) {
		const [task] = await db
			.insert(taskTable)
			.values({
				conferenceId,
				speakerProfileId: speaker.id,
				title: `Upload ${file.filename}`,
				kind: 'file_request',
				status: 'submitted'
			})
			.returning({ id: taskTable.id });

		await db.insert(deliverableTable).values({
			taskId: task.id,
			fileUrl: `fixture/${conferenceId}/${index}/${file.filename}`,
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: 2048,
			version: 1
		});
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const fixture = withDefaults((await request.json()) as FixtureRequest);
	if (!fixture) {
		return json({ error: 'userId and slug are required' }, { status: 400 });
	}

	const organizationId = await organizationOf(fixture.userId);
	if (!organizationId) {
		return json({ error: 'that user has no organization' }, { status: 400 });
	}

	const { days, sessions } = fixture;

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: fixture.name,
			slug: fixture.slug,
			startsOn: days[0] ?? null,
			endsOn: days[days.length - 1] ?? null
		})
		.returning();

	if (days.length > 0) {
		await db
			.insert(conferenceDayTable)
			.values(days.map((date, position) => ({ conferenceId: conference.id, date, position })));
	}

	const trackIds = await addTracks(conference.id, fixture.tracks);
	const firstSubmissionId = await addSessions(conference.id, organizationId, fixture, trackIds);
	if (firstSubmissionId) {
		await addAnswers(conference.id, firstSubmissionId, [
			...fixture.attachments.map((a) => ({ label: a.label, value: a.url, kind: 'file' as const })),
			...fixture.textAnswers.map((a) => ({ ...a, kind: 'short_text' as const }))
		]);
	}

	if (fixture.contentFiles.length > 0) {
		await addContentFiles(conference.id, organizationId, fixture.contentFiles);
	}

	if (fixture.reviewed.length > 0) {
		await addSubmittedReviews(conference.id, fixture.userId, fixture.reviewed, fixture.blindReview);
	}

	return json({
		success: true,
		conference: { id: conference.id, slug: conference.slug },
		dayCount: days.length,
		sessionCount: sessions.length
	});
};
