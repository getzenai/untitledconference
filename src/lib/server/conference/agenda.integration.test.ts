/**
 * The organizer's programme grid.
 *
 * Two kinds of assertion here, and only one of them is about the happy path.
 *
 * The first is scoping: every function takes a conference id, and a placement from a
 * different conference must be untouchable through it. That bug typechecks and looks
 * right in review.
 *
 * The second is the conflict queries. A schedule that quietly fails to report a double
 * booking is worse than one with no conflict detection at all — the organizer trusts a
 * clean screen. So the fixtures below deliberately construct clashes, including the
 * one a grid read room-by-room cannot show: a speaker in two rooms at once.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable,
	sessionFormatTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	DAY_ENDS_AT,
	addRoom,
	agendaBoard,
	autoPlace,
	backfillTray,
	conflicts,
	placeSession,
	setAgendaPublished,
	setPlacementStatus,
	slotInstant,
	slotMinutes,
	slotOptions,
	swapPlacements,
	unplaceSession
} from './agenda';

const suffix = `agenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const userId = `user-${suffix}`;

let conferenceId = 0;
/** A second conference, to prove the scoping is in the query and not in the caller. */
let otherConferenceId = 0;
let dayIds: number[] = [];
let roomIds: number[] = [];
let formatId = 0;
let speakerId = 0;

/** placement ids by the submission title they carry. */
const placementOf: Record<string, number> = {};
let foreignPlacementId = 0;

async function makeSubmission(title: string, conference = conferenceId) {
	const [submission] = await db
		.insert(submissionTable)
		.values({
			conferenceId: conference,
			title,
			sessionFormatId: formatId,
			status: 'accepted'
		})
		.returning();

	const [placement] = await db
		.insert(placementTable)
		.values({
			conferenceId: conference,
			kind: 'session',
			status: 'tentative',
			submissionId: submission.id
		})
		.returning();

	placementOf[title] = placement.id;
	return { submissionId: submission.id, placementId: placement.id };
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Agenda Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: userId,
		email: `${userId}@example.test`,
		emailVerified: true,
		name: 'Organizer'
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Agenda Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-13',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	const [other] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Other Conf',
			slug: `other-${suffix}`,
			startsOn: '2027-06-01',
			endsOn: '2027-06-01',
			status: 'published'
		})
		.returning();
	otherConferenceId = other.id;

	const days = await db
		.insert(conferenceDayTable)
		.values([
			{ conferenceId, date: '2027-05-12', position: 0 },
			{ conferenceId, date: '2027-05-13', position: 1 }
		])
		.returning();
	dayIds = days.map((d) => d.id);

	const rooms = await db
		.insert(roomTable)
		.values([
			{ conferenceId, name: 'Main Stage', position: 0 },
			{ conferenceId, name: 'Room 2A', position: 1 }
		])
		.returning();
	roomIds = rooms.map((r) => r.id);

	const [format] = await db
		.insert(sessionFormatTable)
		.values({ conferenceId, name: 'Talk', minutes: 30, position: 0 })
		.returning();
	formatId = format.id;

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Overbooked Person', sortName: 'Person, Overbooked' })
		.returning();
	speakerId = speaker.id;

	const one = await makeSubmission('Talk one');
	const two = await makeSubmission('Talk two');
	await makeSubmission('Talk three');

	// The same speaker on two different talks — the fixture for the conflict a
	// room-by-room reading cannot see.
	await db.insert(submissionSpeakerTable).values([
		{ submissionId: one.submissionId, speakerProfileId: speakerId, isPrimary: true, position: 0 },
		{ submissionId: two.submissionId, speakerProfileId: speakerId, isPrimary: true, position: 0 }
	]);

	const foreign = await makeSubmission('Somebody else’s talk', otherConferenceId);
	foreignPlacementId = foreign.placementId;
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.id, otherConferenceId));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, userId));
});

describe('slots', () => {
	it('round-trips a time through the stored instant', () => {
		// Written as UTC and read as UTC. Anything else shifts every session by the
		// reader's offset — the same class of bug as the 2001 date.
		expect(slotMinutes(slotInstant('2027-05-12', 9 * 60 + 30))).toBe(9 * 60 + 30);
	});

	it('offers slots inside the conference day only', () => {
		const options = slotOptions();
		expect(options[0].label).toBe('09:00');
		expect(options.at(-1)!.minutes).toBeLessThan(DAY_ENDS_AT);
	});
});

describe('the tray and the grid', () => {
	it('starts with every accepted talk in the tray and nothing on the grid', async () => {
		const board = await agendaBoard(conferenceId);
		expect(board.placed).toHaveLength(0);
		expect(board.tray.map((t) => t.title)).toEqual(['Talk one', 'Talk three', 'Talk two']);
		// The other conference's talk must not appear here.
		expect(board.tray.map((t) => t.title)).not.toContain('Somebody else’s talk');
	});

	it('moves a session onto the grid and computes the end from the format', async () => {
		const result = await placeSession(conferenceId, placementOf['Talk one'], {
			dayId: dayIds[0],
			roomId: roomIds[0],
			startMinutes: 9 * 60 + 30
		});

		expect(result).toEqual({ ok: true, endMinutes: 10 * 60 });

		const board = await agendaBoard(conferenceId);
		const placed = board.placed.find((p) => p.title === 'Talk one');
		expect(placed?.startMinutes).toBe(9 * 60 + 30);
		expect(placed?.endMinutes).toBe(10 * 60);
		expect(board.tray.map((t) => t.title)).not.toContain('Talk one');
	});

	it('sends a session back to the tray, and back to tentative with it', async () => {
		await setPlacementStatus(conferenceId, placementOf['Talk three'], 'confirmed');
		await placeSession(conferenceId, placementOf['Talk three'], {
			dayId: dayIds[1],
			roomId: roomIds[1],
			startMinutes: 11 * 60
		});

		expect(await unplaceSession(conferenceId, placementOf['Talk three'])).toBe(true);

		const board = await agendaBoard(conferenceId);
		const back = board.tray.find((t) => t.title === 'Talk three');
		// A confirmed placement with no slot would claim to be published while having
		// nowhere to be.
		expect(back?.status).toBe('tentative');
	});

	it('treats a break with no room as scheduled, not as waiting for a slot', async () => {
		// Found by looking at the screen rather than by a test: the demo tenant's three
		// lunch blocks have a day and a time but a null room on purpose — "across every
		// room" — and a placed-check that demanded a room queued all three in the tray
		// as "talks needing a slot".
		const [lunch] = await db
			.insert(placementTable)
			.values({
				conferenceId,
				kind: 'block',
				status: 'confirmed',
				title: 'Lunch',
				conferenceDayId: dayIds[0],
				startsAt: slotInstant('2027-05-12', 12 * 60 + 30),
				endsAt: slotInstant('2027-05-12', 13 * 60 + 30),
				roomId: null
			})
			.returning();

		const board = await agendaBoard(conferenceId);
		expect(board.tray.map((t) => t.placementId)).not.toContain(lunch.id);
		expect(board.placed.map((p) => p.placementId)).toContain(lunch.id);
	});

	it('refuses a start time outside the conference day', async () => {
		const result = await placeSession(conferenceId, placementOf['Talk three'], {
			dayId: dayIds[0],
			roomId: roomIds[0],
			startMinutes: 3 * 60
		});
		expect(result.ok).toBe(false);
	});

	/**
	 * A sponsor hold is a slot the programme has already spent, and it is not a
	 * session (#450). It has no submission, so it has no format, so the three
	 * session moves would each read its length as `DEFAULT_MINUTES` — a two-hour
	 * hold moved one row down comes back as thirty minutes, and the committee's
	 * remaining count is wrong at the exact moment somebody reads it out. A hold
	 * leaves the grid through `removeBlock`, which is the mirror of this: it
	 * refuses sessions.
	 */
	describe('a hold is not a session', () => {
		let holdId = 0;

		beforeAll(async () => {
			const [hold] = await db
				.insert(placementTable)
				.values({
					conferenceId,
					kind: 'reservation',
					status: 'confirmed',
					title: 'Gold sponsor slot',
					conferenceDayId: dayIds[0],
					startsAt: slotInstant('2027-05-12', 14 * 60),
					endsAt: slotInstant('2027-05-12', 16 * 60),
					roomId: roomIds[0]
				})
				.returning();
			holdId = hold.id;
		});

		it('will not move it, and leaves its two hours alone', async () => {
			const result = await placeSession(conferenceId, holdId, {
				dayId: dayIds[0],
				roomId: roomIds[1],
				startMinutes: 15 * 60
			});
			expect(result.ok).toBe(false);

			const board = await agendaBoard(conferenceId);
			const hold = board.placed.find((p) => p.placementId === holdId);
			expect(hold?.startMinutes).toBe(14 * 60);
			expect(hold?.endMinutes).toBe(16 * 60);
			expect(hold?.roomId).toBe(roomIds[0]);
		});

		it('will not take it off the grid — release is the way out', async () => {
			expect(await unplaceSession(conferenceId, holdId)).toBe(false);

			const board = await agendaBoard(conferenceId);
			expect(board.placed.map((p) => p.placementId)).toContain(holdId);
			expect(board.tray.map((t) => t.placementId)).not.toContain(holdId);
		});

		it('will not swap it with a talk, in either direction', async () => {
			const talk = placementOf['Talk one'];
			expect((await swapPlacements(conferenceId, holdId, talk)).ok).toBe(false);
			expect((await swapPlacements(conferenceId, talk, holdId)).ok).toBe(false);

			const board = await agendaBoard(conferenceId);
			expect(board.placed.find((p) => p.placementId === holdId)?.startMinutes).toBe(14 * 60);
		});
	});
});

describe('scoping — the conference id is in the query, not in the caller', () => {
	it('will not place another conference’s session', async () => {
		const result = await placeSession(conferenceId, foreignPlacementId, {
			dayId: dayIds[0],
			roomId: roomIds[0],
			startMinutes: 9 * 60
		});
		expect(result).toEqual({ ok: false, reason: 'No such session' });
	});

	it('will not unplace or publish another conference’s session', async () => {
		expect(await unplaceSession(conferenceId, foreignPlacementId)).toBe(false);
		expect(await setPlacementStatus(conferenceId, foreignPlacementId, 'confirmed')).toBe(false);
	});

	it('will not place into another conference’s day or room', async () => {
		const [foreignDay] = await db
			.insert(conferenceDayTable)
			.values({ conferenceId: otherConferenceId, date: '2027-06-01', position: 0 })
			.returning();

		const result = await placeSession(conferenceId, placementOf['Talk two'], {
			dayId: foreignDay.id,
			roomId: roomIds[0],
			startMinutes: 9 * 60
		});
		expect(result).toEqual({ ok: false, reason: 'No such day' });
	});
});

describe('conflicts (AIA-05)', () => {
	it('reports two sessions sharing a room and a time', async () => {
		// Talk one already sits in Main Stage at 09:30. Same room, overlapping window.
		await placeSession(conferenceId, placementOf['Talk two'], {
			dayId: dayIds[0],
			roomId: roomIds[0],
			startMinutes: 9 * 60 + 45
		});

		const found = await conflicts(conferenceId);
		const room = found.filter((c) => c.kind === 'room');
		expect(room).toHaveLength(1);
		expect(room[0].detail).toContain('Main Stage');
		// The time in the message is rendered in the same clock the slot was written in.
		// `to_char` on a timestamptz uses the database session's timezone, so without an
		// explicit UTC cast this label drifts by the server's offset while the grid above
		// it does not — two different times for one session, on one screen.
		expect(room[0].detail).toContain('09:30');
	});

	it('reports one speaker in two rooms at once', async () => {
		// Move Talk two to a different room but the same time: the room clash is gone
		// and the speaker clash must remain. Without the speaker query this looks clean.
		await placeSession(conferenceId, placementOf['Talk two'], {
			dayId: dayIds[0],
			roomId: roomIds[1],
			startMinutes: 9 * 60 + 45
		});

		const found = await conflicts(conferenceId);
		expect(found.filter((c) => c.kind === 'room')).toHaveLength(0);

		const speaker = found.filter((c) => c.kind === 'speaker');
		expect(speaker).toHaveLength(1);
		expect(speaker[0].detail).toContain('Overbooked Person');
	});

	it('says nothing about sessions that merely touch', async () => {
		// 09:30–10:00 and 10:00–10:30 share an instant but not an interval.
		await placeSession(conferenceId, placementOf['Talk two'], {
			dayId: dayIds[0],
			roomId: roomIds[0],
			startMinutes: 10 * 60
		});

		expect(await conflicts(conferenceId)).toHaveLength(0);
	});
});

describe('publishing', () => {
	it('publishes what is on the grid and leaves the tray alone', async () => {
		const changed = await setAgendaPublished(conferenceId, true);
		expect(changed).toBeGreaterThan(0);

		const board = await agendaBoard(conferenceId);
		expect(board.placed.every((p) => p.status === 'confirmed')).toBe(true);
		// A tray item promoted to confirmed would satisfy the unique index and then be
		// invisible on the agenda — worse than staying honestly unscheduled.
		expect(board.tray.every((t) => t.status === 'tentative')).toBe(true);
	});

	it('is idempotent — publishing twice changes nothing the second time', async () => {
		expect(await setAgendaPublished(conferenceId, true)).toBe(0);
	});

	it('pulls the whole agenda back', async () => {
		expect(await setAgendaPublished(conferenceId, false)).toBeGreaterThan(0);
		const board = await agendaBoard(conferenceId);
		expect(board.placed.every((p) => p.status === 'tentative')).toBe(true);
	});
});

describe('auto-place', () => {
	it('fills the tray without creating a conflict it could have avoided', async () => {
		await unplaceSession(conferenceId, placementOf['Talk one']);
		await unplaceSession(conferenceId, placementOf['Talk two']);

		const placed = await autoPlace(conferenceId);
		expect(placed).toBe(3);

		const board = await agendaBoard(conferenceId);
		expect(board.tray).toHaveLength(0);

		// Asserted from the placements themselves, not via conflicts(): if this only
		// checked `conflicts()` it would pass just as happily when the detector is
		// broken as when the filler is right. Talks one and two share a speaker, so a
		// naive filler that only looks at rooms puts them in the same slot in two rooms.
		const one = board.placed.find((p) => p.title === 'Talk one')!;
		const two = board.placed.find((p) => p.title === 'Talk two')!;
		const sameDay = one.dayId === two.dayId;
		const overlapping = one.startMinutes! < two.endMinutes! && two.startMinutes! < one.endMinutes!;
		expect(sameDay && overlapping).toBe(false);

		expect(await conflicts(conferenceId)).toHaveLength(0);
	});

	it('leaves an already-placed session where the organizer put it', async () => {
		const before = await agendaBoard(conferenceId);
		const anchor = before.placed.find((p) => p.title === 'Talk one')!;

		await autoPlace(conferenceId);

		const after = await agendaBoard(conferenceId);
		const same = after.placed.find((p) => p.title === 'Talk one')!;
		expect(same.startMinutes).toBe(anchor.startMinutes);
		expect(same.roomId).toBe(anchor.roomId);
	});

	it('still treats a room-bound hold as only that room', async () => {
		const { placementId } = await makeSubmission('Other room is free');
		const dates = ['2027-05-12', '2027-05-13'] as const;
		await db.insert(placementTable).values(
			dayIds.map((dayId, i) => ({
				conferenceId,
				kind: 'block' as const,
				status: 'confirmed' as const,
				title: `Main Stage reserved ${dates[i]}`,
				conferenceDayId: dayId,
				startsAt: slotInstant(dates[i], 9 * 60),
				endsAt: slotInstant(dates[i], 18 * 60),
				roomId: roomIds[0]
			}))
		);

		expect(await autoPlace(conferenceId)).toBe(1);

		const board = await agendaBoard(conferenceId);
		const placed = board.placed.find((p) => p.placementId === placementId);
		expect(placed?.roomId).toBe(roomIds[1]);
	});

	it('does not put a talk in a roomless hold, even when that is the only remaining window', async () => {
		// Two rooms, lunch across both, the rest of both days already spent —
		// the 60-minute talk's only hole is the break, so it has to stay in
		// the tray rather than land in Mittagessen (#565).
		const [hour] = await db
			.insert(sessionFormatTable)
			.values({ conferenceId, name: 'Hour', minutes: 60, position: 9 })
			.returning();
		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId,
				title: 'Only lunch',
				sessionFormatId: hour.id,
				status: 'accepted'
			})
			.returning();
		const [talk] = await db
			.insert(placementTable)
			.values({
				conferenceId,
				kind: 'session',
				status: 'tentative',
				submissionId: submission.id
			})
			.returning();

		const dates = ['2027-05-12', '2027-05-13'] as const;
		const blocks: {
			title: string;
			day: number;
			roomId: number | null;
			start: number;
			end: number;
		}[] = [
			{ title: 'Lunch all rooms', day: 0, roomId: null, start: 12 * 60 + 30, end: 13 * 60 + 30 },
			{ title: 'Day two closed', day: 1, roomId: null, start: 9 * 60, end: 18 * 60 }
		];
		for (const roomId of roomIds) {
			blocks.push(
				{ title: `Morning ${roomId}`, day: 0, roomId, start: 9 * 60, end: 12 * 60 + 30 },
				{ title: `Afternoon ${roomId}`, day: 0, roomId, start: 13 * 60 + 30, end: 18 * 60 }
			);
		}
		await db.insert(placementTable).values(
			blocks.map((b) => ({
				conferenceId,
				kind: 'block' as const,
				status: 'confirmed' as const,
				title: b.title,
				conferenceDayId: dayIds[b.day],
				startsAt: slotInstant(dates[b.day], b.start),
				endsAt: slotInstant(dates[b.day], b.end),
				roomId: b.roomId
			}))
		);

		expect(await autoPlace(conferenceId)).toBe(0);

		const board = await agendaBoard(conferenceId);
		expect(board.tray.map((t) => t.placementId)).toContain(talk.id);
		expect(board.placed.map((p) => p.placementId)).not.toContain(talk.id);
	});
});

describe('rooms added inline (AIA-02)', () => {
	it('appends a room and makes it usable at once', async () => {
		const id = await addRoom(conferenceId, '  Workshop Lab  ');
		expect(id).not.toBeNull();

		const board = await agendaBoard(conferenceId);
		const created = board.rooms.find((r) => r.id === id);
		expect(created?.name).toBe('Workshop Lab');
		// Appended, not inserted at the front: an existing grid should not reshuffle.
		expect(board.rooms.at(-1)?.id).toBe(id);
	});

	it('ignores a blank name rather than creating an unnamed column', async () => {
		expect(await addRoom(conferenceId, '   ')).toBeNull();
	});
});

describe('backfill', () => {
	it('gives an accepted talk with no placement a tray entry', async () => {
		// A decision taken before this feature existed, or by an import.
		const [orphan] = await db
			.insert(submissionTable)
			.values({
				conferenceId,
				title: 'Decided before the builder existed',
				sessionFormatId: formatId,
				status: 'accepted'
			})
			.returning();

		expect(await backfillTray(conferenceId)).toBe(1);

		const board = await agendaBoard(conferenceId);
		expect(board.tray.map((t) => t.submissionId)).toContain(orphan.id);

		// Second run finds nothing, so it is safe to call on every page load.
		expect(await backfillTray(conferenceId)).toBe(0);
	});
});

describe('tray order', () => {
	/**
	 * Own conference so the insert order is ours, not the shared fixture's.
	 * Zebra is written first; the board must still read Apple first.
	 */
	const own = `tray-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	let ownConferenceId = 0;

	beforeAll(async () => {
		const [conference] = await db
			.insert(conferenceTable)
			.values({
				organizationId,
				name: 'Tray Order Conf',
				slug: `conf-${own}`,
				startsOn: '2027-07-01',
				endsOn: '2027-07-01',
				status: 'published'
			})
			.returning();
		ownConferenceId = conference.id;

		const [format] = await db
			.insert(sessionFormatTable)
			.values({ conferenceId: ownConferenceId, name: 'Talk', minutes: 30, position: 0 })
			.returning();

		for (const title of ['Zebra', 'Apple']) {
			const [submission] = await db
				.insert(submissionTable)
				.values({
					conferenceId: ownConferenceId,
					title,
					sessionFormatId: format.id,
					status: 'accepted'
				})
				.returning();
			await db.insert(placementTable).values({
				conferenceId: ownConferenceId,
				kind: 'session',
				status: 'tentative',
				submissionId: submission.id
			});
		}
	});

	afterAll(async () => {
		await db.delete(conferenceTable).where(eq(conferenceTable.id, ownConferenceId));
	});

	it('lists waiting talks by title, even when the rows were inserted backwards', async () => {
		const board = await agendaBoard(ownConferenceId);
		expect(board.tray.map((t) => t.title)).toEqual(['Apple', 'Zebra']);
	});
});
