/**
 * Keeping the agenda grid in step with the conference dates (#86).
 *
 * The pure date walk is tested next to itself in `conference-dates.unit.test.ts`.
 * What needs a database is the part that can destroy work: `placement` cascades
 * on `conference_day_id`, so a day deleted for being out of range takes every
 * session on it with it, silently. These tests exist to make that impossible to
 * reintroduce without a red run.
 */
import { db, withRequestScopedDb } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { placeSession } from './agenda';
import { syncConferenceDays } from './conference-days';

const suffix = `days-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgId = `org-${suffix}`;

const created: number[] = [];
let conferenceId: number;

/** The days as the board reads them: date order comes from `position`. */
async function daysByPosition() {
	return db
		.select({
			id: conferenceDayTable.id,
			date: conferenceDayTable.date,
			position: conferenceDayTable.position
		})
		.from(conferenceDayTable)
		.where(eq(conferenceDayTable.conferenceId, conferenceId))
		.orderBy(asc(conferenceDayTable.position));
}

/** Park a break on a day, so that day is "in use" without needing a submission. */
async function occupy(dayId: number) {
	const [placement] = await db
		.insert(placementTable)
		.values({ conferenceId, kind: 'block', title: 'Lunch', conferenceDayId: dayId })
		.returning();

	return placement.id;
}

/**
 * Runs `fn` on a database connection of its own.
 *
 * The process-wide client is `max: 1`, so two transactions cannot interleave on
 * it — a second query would simply queue behind the first and the test would
 * hang rather than race. `withRequestScopedDb` is the mechanism the request
 * handlers already use to get their own connection; here it is what turns
 * "concurrent" from a hope into a fact.
 */
function onOwnConnection<T>(fn: () => Promise<T>): Promise<T> {
	let closing: Promise<void> | undefined;
	return withRequestScopedDb(fn, (c) => {
		closing = c;
	}).finally(() => closing);
}

/**
 * Whether `promise` finished within `ms` — for asserting that something is
 * *still blocked*, which is the whole claim a lock makes.
 */
function settledWithin(promise: Promise<unknown>, ms = 300): Promise<boolean> {
	return Promise.race([
		promise.then(
			() => true,
			() => true
		),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))
	]);
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: orgId, name: 'Days Org', slug: orgId, createdAt: new Date() });
});

beforeEach(async () => {
	// A fresh conference per test: these all mutate the same small set of rows,
	// and a leftover day from the previous case would read as a real result.
	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId: orgId,
			name: 'DevFlow Conf 2028',
			slug: `${suffix}-${created.length}`,
			startsOn: '2028-05-12',
			endsOn: '2028-05-14'
		})
		.returning();

	conferenceId = conference.id;
	created.push(conference.id);
});

afterAll(async () => {
	if (created.length > 0) {
		await db.delete(conferenceTable).where(inArray(conferenceTable.id, created));
	}
	await db.delete(organization).where(eq(organization.id, orgId));
});

describe('syncConferenceDays', () => {
	it('derives one day per calendar day in the range', async () => {
		const sync = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');

		expect(sync.added).toEqual(['2028-05-12', '2028-05-13', '2028-05-14']);
		expect((await daysByPosition()).map((day) => [day.date, day.position])).toEqual([
			['2028-05-12', 0],
			['2028-05-13', 1],
			['2028-05-14', 2]
		]);
	});

	it('changes nothing on a second run and keeps the day ids', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');
		const before = await daysByPosition();

		const again = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');

		expect(again).toEqual({ added: [], removed: [], keptInUse: [] });
		// Ids, not just dates: placements point at these. A delete-and-recreate
		// would pass a date-only assertion and take the whole grid with it.
		expect(await daysByPosition()).toEqual(before);
	});

	it('extends the grid without touching the days that already exist', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');
		const before = await daysByPosition();

		const sync = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-15');

		expect(sync.added).toEqual(['2028-05-15']);
		expect(sync.removed).toEqual([]);
		expect((await daysByPosition()).slice(0, 3)).toEqual(before);
	});

	it('renumbers when the range grows at the front, so the board reads in date order', async () => {
		await syncConferenceDays(conferenceId, '2028-05-13', '2028-05-14');

		await syncConferenceDays(conferenceId, '2028-05-11', '2028-05-14');

		expect((await daysByPosition()).map((day) => day.date)).toEqual([
			'2028-05-11',
			'2028-05-12',
			'2028-05-13',
			'2028-05-14'
		]);
	});

	it('drops a day that fell out of the range while it was empty', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');

		const sync = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-13');

		expect(sync.removed).toEqual(['2028-05-14']);
		expect(sync.keptInUse).toEqual([]);
		expect((await daysByPosition()).map((day) => day.date)).toEqual(['2028-05-12', '2028-05-13']);
	});

	it('keeps an out-of-range day that still holds sessions, and says which', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');
		const [, , third] = await daysByPosition();
		const placementId = await occupy(third.id);

		const sync = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-13');

		expect(sync.removed).toEqual([]);
		expect(sync.keptInUse).toEqual(['2028-05-14']);

		// The point of the guard: the session is still there.
		const survivors = await db
			.select({ id: placementTable.id })
			.from(placementTable)
			.where(eq(placementTable.id, placementId));
		expect(survivors).toHaveLength(1);
	});

	it('drops the empty days of a shrink even when another one is in use', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-15');
		const days = await daysByPosition();
		await occupy(days[3].id);

		const sync = await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-12');

		expect(sync.removed).toEqual(['2028-05-13', '2028-05-14']);
		expect(sync.keptInUse).toEqual(['2028-05-15']);
		expect((await daysByPosition()).map((day) => day.date)).toEqual(['2028-05-12', '2028-05-15']);
	});

	it('leaves the grid alone when the start date is cleared', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-14');
		const before = await daysByPosition();

		// "Not stated yet" is not "no days". Deriving an empty set from a cleared
		// field would delete the grid the organizer built.
		const sync = await syncConferenceDays(conferenceId, null, null);

		expect(sync).toEqual({ added: [], removed: [], keptInUse: [] });
		expect(await daysByPosition()).toEqual(before);
	});

	it('treats a missing end date as a one-day conference', async () => {
		const sync = await syncConferenceDays(conferenceId, '2028-05-12', null);

		expect(sync.added).toEqual(['2028-05-12']);
	});
});

/**
 * The guard under concurrency (#93 review).
 *
 * Everything above runs one statement after another, where "the day is empty"
 * stays true between reading it and acting on it. In production it does not:
 * one organizer shortens the range while another drags a talk onto the day
 * about to go. Both of these tests pin one of the two orders the lock allows,
 * and neither of them may end in a placement that reported success and is gone.
 */
describe('syncConferenceDays under a concurrent placement', () => {
	it('waits for a placement in flight and then keeps the day it landed on', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-15');
		const days = await daysByPosition();
		const lastDay = days[3];

		let shrink!: Promise<unknown>;
		let placementId!: number;

		await db.transaction(async (tx) => {
			// Exactly the lock `placeSession` takes on the day it is about to write
			// to — taken here by hand so the write can be held open mid-flight.
			await tx
				.select({ id: conferenceDayTable.id })
				.from(conferenceDayTable)
				.where(eq(conferenceDayTable.id, lastDay.id))
				.for('key share');

			shrink = onOwnConnection(() => syncConferenceDays(conferenceId, '2028-05-12', '2028-05-13'));

			// The assertion that makes this a lock test. Unlocked, the shrink runs
			// straight through here: it reads no placements, deletes the day, and
			// the cascade eats the row inserted on the next line.
			expect(await settledWithin(shrink)).toBe(false);

			const [placement] = await tx
				.insert(placementTable)
				.values({ conferenceId, kind: 'block', title: 'Lunch', conferenceDayId: lastDay.id })
				.returning();
			placementId = placement.id;
		});

		expect(await shrink).toEqual({
			added: [],
			removed: ['2028-05-14'],
			keptInUse: ['2028-05-15']
		});

		const survivors = await db
			.select({ dayId: placementTable.conferenceDayId })
			.from(placementTable)
			.where(eq(placementTable.id, placementId));
		expect(survivors).toEqual([{ dayId: lastDay.id }]);
	});

	it('makes a placement that lost the race say so instead of failing', async () => {
		await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-15');
		const days = await daysByPosition();
		const lastDay = days[3];

		const [room] = await db
			.insert(roomTable)
			.values({ conferenceId, name: 'Hall 1' })
			.returning({ id: roomTable.id });
		// A talk, not a break: `placeSession` only moves sessions, and a break on
		// the grid is put there and released rather than dragged (#450). What this
		// test is about is the day underneath, which is the same either way.
		const [tray] = await db
			.insert(placementTable)
			.values({ conferenceId, kind: 'session', title: 'A talk with no slot yet' })
			.returning({ id: placementTable.id });

		let placing!: ReturnType<typeof placeSession>;

		await db.transaction(async (tx) => {
			await syncConferenceDays(conferenceId, '2028-05-12', '2028-05-13', tx);

			// The shrink has decided the day is empty and deleted it, but has not
			// committed. The placement arriving now must not be allowed to slip in
			// behind that decision.
			placing = onOwnConnection(() =>
				placeSession(conferenceId, tray.id, {
					dayId: lastDay.id,
					roomId: room.id,
					startMinutes: 10 * 60
				})
			);
			expect(await settledWithin(placing)).toBe(false);
		});

		// A plain answer, not a foreign key error: the day genuinely is not there
		// any more by the time this call gets to look.
		expect(await placing).toEqual({ ok: false, reason: 'No such day' });

		const [after] = await db
			.select({ dayId: placementTable.conferenceDayId })
			.from(placementTable)
			.where(eq(placementTable.id, tray.id));
		expect(after.dayId).toBeNull();
	});
});
