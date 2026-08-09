/**
 * The write behind the "Watch recording" button.
 *
 * The placement id arrives from a form field, so the only thing standing between an
 * organizer of conference A and conference B's programme is the conference in the
 * WHERE clause. That is what these tests are about; the URL validation itself is pure
 * and lives in the unit test next to it.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setRecordingUrl } from './recordings';

const suffix = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let other: Conference;
let placementId: number;
let otherPlacementId: number;

async function addPlacement(target: Conference, title: string) {
	const [row] = await db
		.insert(placementTable)
		.values({ conferenceId: target.id, kind: 'block', status: 'confirmed', title })
		.returning();
	return row.id;
}

const recordingOf = async (id: number) => {
	const [row] = await db
		.select({ url: placementTable.recordingUrl })
		.from(placementTable)
		.where(eq(placementTable.id, id));
	return row.url;
};

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Recording Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Recording Conf', slug: suffix })
		.returning();
	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();

	placementId = await addPlacement(conference, 'Keynote');
	otherPlacementId = await addPlacement(other, 'Their keynote');
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('setting a recording link', () => {
	it('stores the link on the conference’s own placement', async () => {
		expect(await setRecordingUrl(conference.id, placementId, 'https://example.com/a')).toBe(true);
		expect(await recordingOf(placementId)).toBe('https://example.com/a');
	});

	it('clears the link when the field is emptied', async () => {
		await setRecordingUrl(conference.id, placementId, 'https://example.com/a');
		expect(await setRecordingUrl(conference.id, placementId, null)).toBe(true);
		expect(await recordingOf(placementId)).toBeNull();
	});

	it('refuses a placement belonging to another conference, and changes nothing', async () => {
		// The same organization owns both, so ownership alone would let this through —
		// the conference in the WHERE clause is what stops it.
		expect(await setRecordingUrl(conference.id, otherPlacementId, 'https://example.com/b')).toBe(
			false
		);
		expect(await recordingOf(otherPlacementId)).toBeNull();
	});

	it('reports failure for a placement that does not exist', async () => {
		// The caller turns this into a 404 instead of announcing a save that never
		// happened.
		expect(await setRecordingUrl(conference.id, 999_999_999, 'https://example.com/c')).toBe(false);
	});
});
