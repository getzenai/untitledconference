/**
 * Rooms, tracks and formats written a whole block at a time (#110).
 *
 * One submit used to buy one row. That is three round trips per element, and it
 * was measured: in the first sbek calibration run structure setup ate two thirds
 * of the turn budget. These tests cover what batching has to get right to be
 * worth having — order, positions, and a repeat that does not fork the list.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	roomTable,
	sessionFormatTable,
	trackTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addFormat, addFormats, addRoom, addRooms, addTracks, conferenceConfig } from './config';

const suffix = `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let otherConference: Conference;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Config Org',
		slug: organizationId,
		createdAt: new Date()
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
