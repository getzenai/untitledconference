/**
 * Keeping the agenda grid in step with the conference dates (#86).
 *
 * The pure date walk is tested next to itself in `conference-dates.unit.test.ts`.
 * What needs a database is the part that can destroy work: `placement` cascades
 * on `conference_day_id`, so a day deleted for being out of range takes every
 * session on it with it, silently. These tests exist to make that impossible to
 * reintroduce without a red run.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceDayTable, conferenceTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
