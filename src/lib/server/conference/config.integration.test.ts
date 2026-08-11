/**
 * Rooms, tracks and formats written a whole block at a time (#110).
 *
 * One submit used to buy one row. That is three round trips per element, and it
 * was measured: in the first sbek calibration run structure setup ate two thirds
 * of the turn budget. These tests cover what batching has to get right to be
 * worth having — order, positions, and a repeat that does not fork the list.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	membershipTrackTable,
	roomTable,
	sessionFormatTable,
	trackTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	addFormat,
	addFormats,
	addRoom,
	addRooms,
	addTracks,
	conferenceConfig,
	removeFormat,
	removeRoom,
	removeTrack,
	renameRoom,
	renameTrack,
	updateFormat
} from './config';

const suffix = `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const userId = `user-${suffix}`;

let conference: Conference;
let otherConference: Conference;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Config Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: userId,
		name: 'Reviewer',
		email: `${userId}@example.test`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Another Conf', slug: `${suffix}-other` })
		.returning();
});

beforeEach(async () => {
	for (const id of [conference.id, otherConference.id]) {
		await db.delete(roomTable).where(eq(roomTable.conferenceId, id));
		await db.delete(trackTable).where(eq(trackTable.conferenceId, id));
		await db.delete(sessionFormatTable).where(eq(sessionFormatTable.conferenceId, id));
	}
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, userId));
});

describe('adding several rooms in one submit', () => {
	it('writes every line, in the order they were typed', async () => {
		const result = await addRooms(conference.id, 'Main Stage\nRoom 3C\nWorkshop Lab');

		expect(result.added).toEqual(['Main Stage', 'Room 3C', 'Workshop Lab']);
		expect(result.skipped).toEqual([]);

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms.map((room) => room.name)).toEqual(['Main Stage', 'Room 3C', 'Workshop Lab']);
		// Positions are the agenda grid's column order, so they have to be the
		// order of the block and not whatever the database hands back.
		expect(rooms.map((room) => room.position)).toEqual([0, 1, 2]);
	});

	it('appends after what is already there rather than renumbering it', async () => {
		await addRooms(conference.id, 'Main Stage');
		await addRooms(conference.id, 'Room 3C\nWorkshop Lab');

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms.map((room) => room.name)).toEqual(['Main Stage', 'Room 3C', 'Workshop Lab']);
		expect(rooms.map((room) => room.position)).toEqual([0, 1, 2]);
	});

	/**
	 * The point of skipping: a submit whose response was lost can simply be sent
	 * again. Two rooms called "Main Stage" cannot be told apart on the grid.
	 */
	it('sends the same block twice and changes nothing the second time', async () => {
		await addRooms(conference.id, 'Main Stage\nRoom 3C');
		const again = await addRooms(conference.id, 'Main Stage\nRoom 3C');

		expect(again.added).toEqual([]);
		expect(again.skipped).toEqual(['Main Stage', 'Room 3C']);

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms).toHaveLength(2);
	});

	it('adds the new lines of a block whose other lines are already there', async () => {
		await addRooms(conference.id, 'Main Stage');
		const result = await addRooms(conference.id, 'main stage\nRoom 3C');

		expect(result.added).toEqual(['Room 3C']);
		expect(result.skipped).toEqual(['main stage']);

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms.map((room) => room.name)).toEqual(['Main Stage', 'Room 3C']);
	});

	it("leaves another conference's list alone", async () => {
		await addRooms(conference.id, 'Main Stage');
		await addRooms(otherConference.id, 'Main Stage\nSide Room');

		expect((await conferenceConfig(conference.id)).rooms).toHaveLength(1);
		expect((await conferenceConfig(otherConference.id)).rooms).toHaveLength(2);
	});

	it('writes nothing for an empty field', async () => {
		const result = await addRooms(conference.id, '   \n\n');

		expect(result.added).toEqual([]);
		expect(result.skipped).toEqual([]);
		expect((await conferenceConfig(conference.id)).rooms).toEqual([]);
	});
});

describe('adding several tracks in one submit', () => {
	it('writes every line and skips what is already on the list', async () => {
		await addTracks(conference.id, 'Security');
		const result = await addTracks(conference.id, 'Security\nPlatform\nAI');

		expect(result.added).toEqual(['Platform', 'AI']);
		expect(result.skipped).toEqual(['Security']);

		const { tracks } = await conferenceConfig(conference.id);
		expect(tracks.map((track) => track.name)).toEqual(['Security', 'Platform', 'AI']);
		expect(tracks.map((track) => track.position)).toEqual([0, 1, 2]);
	});
});

describe('adding several formats in one submit', () => {
	it('reads the length after the comma and leaves it unset without one', async () => {
		const result = await addFormats(conference.id, 'Talk, 30\nWorkshop, 90\nPanel');
		expect(result).not.toHaveProperty('problem');

		const { formats } = await conferenceConfig(conference.id);
		expect(formats.map((format) => [format.name, format.minutes])).toEqual([
			['Talk', 30],
			['Workshop', 90],
			['Panel', null]
		]);
	});

	/**
	 * Half a pasted list is worse than none: the organizer would have to work out
	 * which half landed before they could safely try again.
	 */
	it('writes nothing at all when one line is unusable', async () => {
		const result = await addFormats(conference.id, 'Talk, 30\nMarathon, 5000');

		expect(result).toHaveProperty('problem');
		expect((await conferenceConfig(conference.id)).formats).toEqual([]);
	});
});

/**
 * The agenda builder has always added one room by name (AIA-02). It is now a call
 * into the batch above, so its promises are worth re-checking here.
 */
describe('the single-name helpers the agenda uses', () => {
	it('returns the id of the room it created', async () => {
		const id = await addRoom(conference.id, '  Workshop Lab  ');
		expect(id).not.toBeNull();

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms.find((room) => room.id === id)?.name).toBe('Workshop Lab');
	});

	it('answers null for a blank name instead of creating an unnamed column', async () => {
		expect(await addRoom(conference.id, '   ')).toBeNull();
	});

	// Behaviour that changed with batching, and deliberately: it used to make a
	// second row of the same name.
	it('answers null for a room that is already there', async () => {
		await addRoom(conference.id, 'Main Stage');

		expect(await addRoom(conference.id, 'Main Stage')).toBeNull();
		expect((await conferenceConfig(conference.id)).rooms).toHaveLength(1);
	});

	it("keeps a format's length, and refuses one that is not a whole number", async () => {
		const id = await addFormat(conference.id, 'Keynote', 45);
		expect(id).not.toBeNull();
		expect(await addFormat(conference.id, 'Broken', 12.5)).toBeNull();

		const { formats } = await conferenceConfig(conference.id);
		expect(formats.map((format) => [format.name, format.minutes])).toEqual([['Keynote', 45]]);
	});

	// A name is one line by definition, so a pasted newline must not quietly
	// become two rooms behind the caller's back.
	it('makes one room of a name with a newline in it', async () => {
		const id = await addRoom(conference.id, 'Main\nStage');

		expect(id).not.toBeNull();
		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms.map((room) => room.name)).toEqual(['Main Stage']);
	});
});

/**
 * Renaming and removing (#119).
 *
 * The rename tests are mostly about the id staying put: what makes a rename safe
 * is that every session and submission points at a row, not at a string.
 *
 * The removal tests are the ones worth having. All three foreign keys are
 * `on delete set null` or `cascade`, so the database will take every one of these
 * deletes happily — and hand back an agenda with sessions in no room, submissions
 * with no track, or a reviewer who was narrowed to one track and can now read all
 * of them. Nothing here would fail loudly on its own.
 */
describe('editing and removing what the lists hold', () => {
	beforeEach(async () => {
		await db.delete(placementTable).where(eq(placementTable.conferenceId, conference.id));
		await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	});

	it('renames a room without moving the id anything is scheduled against', async () => {
		const roomId = (await addRoom(conference.id, 'Room 3C'))!;
		const [placement] = await db
			.insert(placementTable)
			.values({ conferenceId: conference.id, kind: 'block', title: 'Lunch', roomId })
			.returning();

		expect(await renameRoom(conference.id, roomId, '  Hall C  ')).toBeNull();

		const { rooms } = await conferenceConfig(conference.id);
		expect(rooms).toEqual([expect.objectContaining({ id: roomId, name: 'Hall C' })]);

		const [still] = await db
			.select({ roomId: placementTable.roomId })
			.from(placementTable)
			.where(eq(placementTable.id, placement.id));
		expect(still.roomId).toBe(roomId);
	});

	it('refuses a rename onto a name the list already carries, whatever the case', async () => {
		const roomId = (await addRoom(conference.id, 'Room 3C'))!;
		await addRoom(conference.id, 'Main Stage');

		expect(await renameRoom(conference.id, roomId, 'main stage')).toContain('already');
		expect((await conferenceConfig(conference.id)).rooms[0].name).toBe('Room 3C');
	});

	it('refuses to rename a room to nothing', async () => {
		const roomId = (await addRoom(conference.id, 'Room 3C'))!;

		expect(await renameRoom(conference.id, roomId, '   ')).toContain('name');
		expect((await conferenceConfig(conference.id)).rooms[0].name).toBe('Room 3C');
	});

	// The id comes from a form, so it is never a claim about which conference it
	// belongs to. A neighbouring conference's room must be untouchable through it.
	it('will not rename or remove a room belonging to another conference', async () => {
		const foreign = (await addRoom(otherConference.id, 'Their Stage'))!;

		expect(await renameRoom(conference.id, foreign, 'Ours Now')).toContain('gone');
		expect(await removeRoom(conference.id, foreign)).toContain('gone');
		expect((await conferenceConfig(otherConference.id)).rooms[0].name).toBe('Their Stage');
	});

	it('removes a room nothing is scheduled in', async () => {
		const roomId = (await addRoom(conference.id, 'Room 3C'))!;

		expect(await removeRoom(conference.id, roomId)).toBeNull();
		expect((await conferenceConfig(conference.id)).rooms).toEqual([]);
	});

	it('keeps a room that still holds sessions, and says how many', async () => {
		const roomId = (await addRoom(conference.id, 'Main Stage'))!;
		await db.insert(placementTable).values([
			{ conferenceId: conference.id, kind: 'block', title: 'Keynote', roomId },
			{ conferenceId: conference.id, kind: 'block', title: 'Lunch', roomId }
		]);

		expect(await removeRoom(conference.id, roomId)).toContain('2 sessions');
		expect((await conferenceConfig(conference.id)).rooms).toHaveLength(1);
	});

	it('keeps a track a submission is in', async () => {
		const trackId = (await addTracks(conference.id, 'Security')).ids[0];
		await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'A talk', trackId });

		expect(await removeTrack(conference.id, trackId)).toContain('1 submission');
		expect((await conferenceConfig(conference.id)).tracks).toHaveLength(1);
	});

	/**
	 * The check that is easy to leave out and expensive to leave out.
	 *
	 * `membership_track` cascades. Deleting the track would delete the narrowing
	 * with it, and a reviewer with no narrowing left reads every track — a
	 * widening of access nobody asked for, arriving through a Remove button in
	 * settings.
	 */
	it('keeps a track a reviewer is limited to, rather than widening them to all of them', async () => {
		const trackId = (await addTracks(conference.id, 'Platform')).ids[0];
		const [membership] = await db
			.insert(membershipTable)
			.values({ userId, role: 'reviewer', scopeType: 'conference', scopeId: conference.id })
			.returning();
		await db.insert(membershipTrackTable).values({ membershipId: membership.id, trackId });

		expect(await removeTrack(conference.id, trackId)).toContain('1 reviewer');
		expect((await conferenceConfig(conference.id)).tracks).toHaveLength(1);

		await db.delete(membershipTable).where(eq(membershipTable.id, membership.id));
	});

	it('renames a track the submissions in it keep pointing at', async () => {
		const trackId = (await addTracks(conference.id, 'Sec')).ids[0];
		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'A talk', trackId })
			.returning();

		expect(await renameTrack(conference.id, trackId, 'Security')).toBeNull();
		expect((await conferenceConfig(conference.id)).tracks[0].name).toBe('Security');

		const [still] = await db
			.select({ trackId: submissionTable.trackId })
			.from(submissionTable)
			.where(eq(submissionTable.id, submission.id));
		expect(still.trackId).toBe(trackId);
	});

	it('removes a track nothing points at', async () => {
		const trackId = (await addTracks(conference.id, 'Platform')).ids[0];

		expect(await removeTrack(conference.id, trackId)).toBeNull();
		expect((await conferenceConfig(conference.id)).tracks).toEqual([]);
	});

	it('saves a format name and length together, and takes an empty length back', async () => {
		const formatId = (await addFormat(conference.id, 'Wokrshop', 90))!;

		expect(await updateFormat(conference.id, formatId, 'Workshop', 120)).toBeNull();
		expect((await conferenceConfig(conference.id)).formats).toEqual([
			expect.objectContaining({ id: formatId, name: 'Workshop', minutes: 120 })
		]);

		expect(await updateFormat(conference.id, formatId, 'Workshop', null)).toBeNull();
		expect((await conferenceConfig(conference.id)).formats[0].minutes).toBeNull();
	});

	it('refuses a length that is not a whole number of minutes in range', async () => {
		const formatId = (await addFormat(conference.id, 'Talk', 30))!;

		expect(await updateFormat(conference.id, formatId, 'Talk', 0)).toContain('Minutes');
		expect(await updateFormat(conference.id, formatId, 'Talk', 12.5)).toContain('Minutes');
		expect(await updateFormat(conference.id, formatId, 'Talk', 24 * 60 + 1)).toContain('Minutes');
		expect((await conferenceConfig(conference.id)).formats[0].minutes).toBe(30);
	});

	it('keeps a format a submission was proposed as', async () => {
		const formatId = (await addFormat(conference.id, 'Talk', 30))!;
		await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'A talk', sessionFormatId: formatId });

		expect(await removeFormat(conference.id, formatId)).toContain('1 submission');
		expect((await conferenceConfig(conference.id)).formats).toHaveLength(1);
	});

	it('removes a format nothing was proposed as', async () => {
		const formatId = (await addFormat(conference.id, 'Panel', null))!;

		expect(await removeFormat(conference.id, formatId)).toBeNull();
		expect((await conferenceConfig(conference.id)).formats).toEqual([]);
	});
});
