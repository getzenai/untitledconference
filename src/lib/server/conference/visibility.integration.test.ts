/**
 * The two switches that decide what an outsider sees, against a real database.
 *
 * `setConferenceListing` is the one with a rule that a typecheck cannot catch:
 * a draft may not be listed. Nothing would break if it were — the directory
 * filters on published *and* listed — but the organizer would press a button,
 * get "listed", and find nothing on the front page with no way to tell why.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setConferenceListing } from './visibility';

const suffix = `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Listing Org',
		slug: organizationId,
		createdAt: new Date()
	});
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

/** A fresh conference per test — these functions write, and shared rows would drift. */
async function conference(status: 'draft' | 'published' | 'archived', listedPublicly = false) {
	const [row] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: `Conf ${Math.random().toString(36).slice(2, 8)}`,
			slug: `conf-${Math.random().toString(36).slice(2, 10)}`,
			status,
			listedPublicly
		})
		.returning();

	return row;
}

async function listedInDb(id: number) {
	const [row] = await db
		.select({ listedPublicly: conferenceTable.listedPublicly })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, id));

	return row.listedPublicly;
}

describe('setConferenceListing', () => {
	it('puts a published conference on the front page', async () => {
		const row = await conference('published');

		const result = await setConferenceListing(row, true);

		expect(result).toEqual({ changed: true, listed: true });
		expect(await listedInDb(row.id)).toBe(true);
	});

	it('takes it off again without touching whether it is published', async () => {
		const row = await conference('published', true);

		const result = await setConferenceListing(row, false);

		expect(result).toEqual({ changed: true, listed: false });
		const [after] = await db
			.select({ status: conferenceTable.status })
			.from(conferenceTable)
			.where(eq(conferenceTable.id, row.id));
		expect(after.status).toBe('published');
	});

	it('refuses to advertise a draft, and says which state stopped it', async () => {
		const row = await conference('draft');

		const result = await setConferenceListing(row, true);

		expect(result).toEqual({ changed: false, listed: false, blocked: 'draft' });
		expect(await listedInDb(row.id)).toBe(false);
	});

	it('refuses to advertise an archived conference', async () => {
		const row = await conference('archived');

		const result = await setConferenceListing(row, true);

		expect(result).toEqual({ changed: false, listed: false, blocked: 'archived' });
		expect(await listedInDb(row.id)).toBe(false);
	});

	/**
	 * Unlisting has to work while archived, or a conference archived by mistake
	 * could never be taken off the front page except by restoring it first.
	 */
	it('still lets an archived conference be taken off the front page', async () => {
		const row = await conference('archived', true);

		const result = await setConferenceListing(row, false);

		expect(result).toEqual({ changed: true, listed: false });
		expect(await listedInDb(row.id)).toBe(false);
	});

	it('is idempotent — asking for the state it is already in changes nothing', async () => {
		const row = await conference('published', true);

		expect(await setConferenceListing(row, true)).toEqual({ changed: false, listed: true });
	});
});
