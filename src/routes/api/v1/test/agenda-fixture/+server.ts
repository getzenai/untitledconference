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
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
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
	 * Which of those titles already carry a handed-in review (#122).
	 *
	 * Same reason as the days: a review cannot be produced through the UI without
	 * walking plan → round → scorecard → assignment → submit in every spec that
	 * wants one reviewed talk. The still-to-review filter is only worth testing
	 * against a pile where some are and some are not, and this is the cheapest
	 * honest way to have both.
	 */
	reviewed?: string[];
	/**
	 * Tracks to create, the first of which is put on the first session.
	 *
	 * A filter needs something to filter by AND something to leave out, so one
	 * track on one of several submissions is the smallest fixture that can tell a
	 * working track filter from one that does nothing.
	 */
	tracks?: string[];
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
	status: 'submitted' | 'in_review' | 'accepted' = 'accepted'
): Promise<void> {
	const decided = status === 'accepted' ? new Date() : null;
	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId, title, status, decidedAt: decided, trackId })
		.returning();

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: `Fixture Speaker ${index + 1}`,
			sortName: `Speaker ${index + 1}`
		})
		.returning();

	await db.insert(submissionSpeakerTable).values({
		submissionId: submission.id,
		speakerProfileId: speaker.id,
		isPrimary: true,
		position: 0
	});
}

/**
 * One handed-in review per named title, under this conference's own plan (#122).
 *
 * No scores: the still-to-review filter and the reviews order both count reviews
 * with `status = 'submitted'`, and a scorecard would only add rows nothing here
 * reads. The reviewer is the organizer themselves, which no rule forbids — they
 * are not a speaker on any of these.
 */
async function addSubmittedReviews(
	conferenceId: number,
	reviewerUserId: string,
	titles: string[]
): Promise<void> {
	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId, name: 'Fixture plan' })
		.returning();
	const [round] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Fixture round', position: 0 })
		.returning();

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
	reviewed: string[];
	tracks: string[];
};

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
		reviewed: body.reviewed ?? [],
		tracks: body.tracks ?? []
	};
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

	for (const [index, title] of sessions.entries()) {
		// Only the first session gets the first track, so a filter that ignores its
		// parameter and returns everything is distinguishable from one that works.
		await addSession(
			conference.id,
			organizationId,
			title,
			index,
			index === 0 ? (trackIds[0] ?? null) : null,
			fixture.sessionStatus
		);
	}

	if (fixture.reviewed.length > 0) {
		await addSubmittedReviews(conference.id, fixture.userId, fixture.reviewed);
	}

	return json({
		success: true,
		conference: { id: conference.id, slug: conference.slug },
		dayCount: days.length,
		sessionCount: sessions.length
	});
};
