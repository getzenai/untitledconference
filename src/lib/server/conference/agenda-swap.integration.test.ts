/**
 * Swapping two scheduled sessions, both or neither.
 *
 * The reason this is a transaction and not two calls is the failure between them:
 * take-out-then-put-in leaves a session in the tray if anything interrupts, and
 * nothing tells the organizer. So the tests that matter here are the ones about
 * *partial* outcomes — a lost placement, a double-booked room, one row moved and the
 * other not — rather than the happy path, which a type-check almost covers on its own.
 *
 * The concurrency cases run on two real connections. The process-wide client is
 * `max: 1`, so a second transaction on it would queue rather than race, and the test
 * would prove nothing while looking green.
 */
import { db, withRequestScopedDb } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable,
	sessionFormatTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conflicts, placeSession, slotInstant, slotMinutes, swapPlacements } from './agenda';

const suffix = `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgId = `org-${suffix}`;

let conferenceId = 0;
let dayId = 0;
let otherDayId = 0;
let rooms: number[] = [];
let shortFormat = 0;
let longFormat = 0;

/** A connection of this call's own, so two transactions can genuinely overlap. */
function onOwnConnection<T>(fn: () => Promise<T>): Promise<T> {
	let closing: Promise<void> | undefined;
	return withRequestScopedDb(fn, (c) => {
		closing = c;
	}).finally(() => closing);
}

/** Whether `promise` finished within `ms` — how "still blocked" is asserted. */
function settledWithin(promise: Promise<unknown>, ms = 300): Promise<boolean> {
	return Promise.race([
		promise.then(
			() => true,
			() => true
		),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))
	]);
}

/** An accepted submission with a placement, scheduled or not. */
async function session(title: string, formatId: number) {
	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId, title, sessionFormatId: formatId, status: 'accepted' })
		.returning();

	const [placement] = await db
		.insert(placementTable)
		.values({ conferenceId, kind: 'session', status: 'tentative', submissionId: submission.id })
		.returning();

	return placement.id;
}

async function slotOf(placementId: number) {
	const [row] = await db
		.select({
			conferenceDayId: placementTable.conferenceDayId,
			roomId: placementTable.roomId,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt
		})
		.from(placementTable)
		.where(eq(placementTable.id, placementId));

	return row;
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: orgId, name: 'Swap Org', slug: orgId, createdAt: new Date() });
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, orgId));
	await db.delete(organization).where(eq(organization.id, orgId));
});

beforeEach(async () => {
	if (conferenceId) await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId: orgId,
			name: 'Swap Conf',
			slug: `swap-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-13',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	const days = await db
		.insert(conferenceDayTable)
		.values([
			{ conferenceId, date: '2027-05-12', position: 0 },
			{ conferenceId, date: '2027-05-13', position: 1 }
		])
		.returning();
	[dayId, otherDayId] = days.map((d) => d.id);

	const roomRows = await db
		.insert(roomTable)
		.values([
			{ conferenceId, name: 'Hall A', position: 0 },
			{ conferenceId, name: 'Hall B', position: 1 }
		])
		.returning();
	rooms = roomRows.map((r) => r.id);

	const formats = await db
		.insert(sessionFormatTable)
		.values([
			{ conferenceId, name: 'Short', minutes: 30 },
			{ conferenceId, name: 'Long', minutes: 45 }
		])
		.returning();
	[shortFormat, longFormat] = formats.map((f) => f.id);
});

describe('swapping two scheduled sessions', () => {
	it('exchanges their slots and gives each one its own length back', async () => {
		const a = await session('Thirty minutes', shortFormat);
		const b = await session('Forty-five minutes', longFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		await placeSession(conferenceId, b, { dayId, roomId: rooms[1], startMinutes: 14 * 60 });

		expect(await swapPlacements(conferenceId, a, b)).toMatchObject({ ok: true });

		const [after, other] = [await slotOf(a), await slotOf(b)];
		expect(after.roomId).toBe(rooms[1]);
		expect(slotMinutes(after.startsAt!)).toBe(14 * 60);
		expect(other.roomId).toBe(rooms[0]);
		expect(slotMinutes(other.startsAt!)).toBe(9 * 60);

		// Each keeps its own duration. Inheriting the other's end would quietly
		// restate how long somebody is speaking.
		expect(slotMinutes(after.endsAt!) - slotMinutes(after.startsAt!)).toBe(30);
		expect(slotMinutes(other.endsAt!) - slotMinutes(other.startsAt!)).toBe(45);
	});

	it('swaps across days too', async () => {
		const a = await session('Day one', shortFormat);
		const b = await session('Day two', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 10 * 60 });
		await placeSession(conferenceId, b, {
			dayId: otherDayId,
			roomId: rooms[0],
			startMinutes: 11 * 60
		});

		expect(await swapPlacements(conferenceId, a, b)).toMatchObject({ ok: true });

		expect((await slotOf(a)).conferenceDayId).toBe(otherDayId);
		expect((await slotOf(b)).conferenceDayId).toBe(dayId);
		// The date moved with the day, not just the id.
		expect((await slotOf(a)).startsAt).toEqual(slotInstant('2027-05-13', 11 * 60));
	});

	it('refuses a partner that is still in the tray, and moves nothing', async () => {
		const placed = await session('On the grid', shortFormat);
		const trayed = await session('Waiting', shortFormat);
		await placeSession(conferenceId, placed, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		const before = await slotOf(placed);

		expect(await swapPlacements(conferenceId, placed, trayed)).toEqual({
			ok: false,
			reason: 'Both sessions have to be on the grid to swap'
		});

		// A refusal that had already written one half would be worse than no swap.
		expect(await slotOf(placed)).toEqual(before);
		expect((await slotOf(trayed)).startsAt).toBeNull();
	});

	it('refuses a session from another conference', async () => {
		const [other] = await db
			.insert(conferenceTable)
			.values({
				organizationId: orgId,
				name: 'Elsewhere',
				slug: `elsewhere-${suffix}-${Date.now()}`,
				status: 'published'
			})
			.returning();
		const [foreign] = await db
			.insert(placementTable)
			.values({ conferenceId: other.id, kind: 'block', status: 'tentative', title: 'Theirs' })
			.returning();

		const mine = await session('Mine', shortFormat);
		await placeSession(conferenceId, mine, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });

		expect(await swapPlacements(conferenceId, mine, foreign.id)).toEqual({
			ok: false,
			reason: 'No such session'
		});
	});

	it('refuses to swap a session with itself', async () => {
		const a = await session('Alone', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });

		expect(await swapPlacements(conferenceId, a, a)).toEqual({
			ok: false,
			reason: 'A session cannot swap with itself'
		});
	});
});

describe('the permissive clash rule stays permissive (AIA-05)', () => {
	it('still lets a plain place overlap an occupied slot, and still reports it', async () => {
		const a = await session('First', shortFormat);
		const b = await session('Second', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		expect((await conflicts(conferenceId)).filter((c) => c.kind === 'room')).toEqual([]);

		// The swap exists precisely so nobody needs this — but it must keep working,
		// because an organizer mid-rearrangement passes through invalid states.
		const overlapped = await placeSession(conferenceId, b, {
			dayId,
			roomId: rooms[0],
			startMinutes: 9 * 60 + 15
		});

		expect(overlapped).toMatchObject({ ok: true });
		const clashes = await conflicts(conferenceId);
		expect(clashes.some((c) => c.kind === 'room')).toBe(true);
	});

	it('does not refuse a swap that happens to create a clash', async () => {
		// Two different lengths in one room: after the exchange the longer one runs
		// into the next slot. That is a clash to *show*, not a reason to refuse — the
		// swap only refuses nonsense inputs.
		const short = await session('Short', shortFormat);
		const long = await session('Long', longFormat);
		const neighbour = await session('Neighbour', shortFormat);
		await placeSession(conferenceId, short, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		await placeSession(conferenceId, neighbour, {
			dayId,
			roomId: rooms[0],
			startMinutes: 9 * 60 + 30
		});
		await placeSession(conferenceId, long, { dayId, roomId: rooms[1], startMinutes: 14 * 60 });

		// The precondition, checked rather than assumed: without it a suite that never
		// clears clashes would pass this test with the swap deleted.
		expect((await conflicts(conferenceId)).filter((c) => c.kind === 'room')).toEqual([]);

		expect(await swapPlacements(conferenceId, short, long)).toMatchObject({ ok: true });

		// 45 minutes from 09:00 runs to 09:45, over the neighbour at 09:30.
		const clashes = await conflicts(conferenceId);
		expect(clashes.some((c) => c.kind === 'room')).toBe(true);
	});
});

describe('two organizers swapping at once', () => {
	it('serialises overlapping swaps instead of deadlocking, and loses no placement', async () => {
		const a = await session('A', shortFormat);
		const b = await session('B', shortFormat);
		const c = await session('C', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		await placeSession(conferenceId, b, { dayId, roomId: rooms[0], startMinutes: 10 * 60 });
		await placeSession(conferenceId, c, { dayId, roomId: rooms[0], startMinutes: 11 * 60 });

		// Both swaps want B. Locking in id order is what stops each from holding one
		// row and waiting for the other's.
		const [first, second] = await Promise.all([
			onOwnConnection(() => swapPlacements(conferenceId, a, b)),
			onOwnConnection(() => swapPlacements(conferenceId, b, c))
		]);

		expect(first).toMatchObject({ ok: true });
		expect(second).toMatchObject({ ok: true });

		// Whatever order they landed in, all three are still on the grid and still in
		// three distinct slots — no row lost its position, none share one.
		const rows = await db
			.select({ id: placementTable.id, startsAt: placementTable.startsAt })
			.from(placementTable)
			.where(inArray(placementTable.id, [a, b, c]))
			.orderBy(asc(placementTable.id));

		expect(rows.every((r) => r.startsAt !== null)).toBe(true);
		expect(new Set(rows.map((r) => r.startsAt!.getTime())).size).toBe(3);
	});

	it('does not deadlock when the same pair is swapped from both directions', async () => {
		// This is the case the lock ordering exists for, and the only one that fails
		// without it: two transactions over the *same* two rows, named in opposite
		// order. Locking as given, one takes a and wants b while the other takes b and
		// wants a — Postgres breaks the cycle by aborting one with a deadlock error,
		// which surfaces as a 500 to whichever organizer lost. Sorting by id makes both
		// reach for a first, so the second simply waits.
		const a = await session('A', shortFormat);
		const b = await session('B', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		await placeSession(conferenceId, b, { dayId, roomId: rooms[1], startMinutes: 15 * 60 });

		const both = await Promise.all([
			onOwnConnection(() => swapPlacements(conferenceId, a, b)),
			onOwnConnection(() => swapPlacements(conferenceId, b, a))
		]);

		expect(both).toEqual([
			{ ok: true, endMinutes: expect.any(Number) },
			{ ok: true, endMinutes: expect.any(Number) }
		]);

		// Two swaps of one pair land back where they started, whichever ran first.
		expect(slotMinutes((await slotOf(a)).startsAt!)).toBe(9 * 60);
		expect((await slotOf(a)).roomId).toBe(rooms[0]);
		expect(slotMinutes((await slotOf(b)).startsAt!)).toBe(15 * 60);
		expect((await slotOf(b)).roomId).toBe(rooms[1]);
	});

	it('waits for a reader that has the row, instead of writing past it', async () => {
		const a = await session('A', shortFormat);
		const b = await session('B', shortFormat);
		await placeSession(conferenceId, a, { dayId, roomId: rooms[0], startMinutes: 9 * 60 });
		await placeSession(conferenceId, b, { dayId, roomId: rooms[0], startMinutes: 10 * 60 });

		// The hold is `FOR KEY SHARE` on purpose, and that choice is the whole test.
		// A plain UPDATE of day/room/time does *not* conflict with it — none of those
		// are key columns — so a swap that skipped `FOR UPDATE` would write straight
		// through this lock and pass. Only the explicit row lock makes it queue.
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let acquired!: () => void;
		// Starting the holder is not the same as the holder *having* the lock. Without
		// waiting for this, the swap sometimes reaches the row first and the test
		// reports "it did not block" about a lock nobody was holding.
		const locked = new Promise<void>((resolve) => (acquired = resolve));

		const holder = onOwnConnection(async () => {
			await db.transaction(async (tx) => {
				await tx
					.select({ id: placementTable.id })
					.from(placementTable)
					.where(eq(placementTable.id, b))
					.for('key share');
				acquired();
				await held;
			});
		});
		await locked;

		const swap = onOwnConnection(() => swapPlacements(conferenceId, a, b));
		try {
			expect(await settledWithin(swap)).toBe(false);
		} finally {
			// A failed assertion here must still end the transaction: the lock would
			// otherwise outlive the test and hang the next `beforeEach` on its DELETE.
			release();
			await holder;
		}

		expect(await swap).toMatchObject({ ok: true });
	});
});
