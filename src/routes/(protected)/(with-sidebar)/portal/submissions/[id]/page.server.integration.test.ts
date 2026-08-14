/**
 * Which call's close instant the proposal page names (#498).
 *
 * The loader used to take `limit(1)` with no status and no order. A conference
 * has more than one `cfp_form` the moment the organizer starts next year's call,
 * and that row is a draft: unpublished, with a date nobody announced. Printing
 * it as the moment the speaker's right to edit ends is worse than the vague
 * sentence this page used to show.
 *
 * Draft first, then published — so `orderBy(id)` alone still picks the wrong
 * row, and only the status filter makes the page quote the announced date.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load } from './+page.server';

const suffix = `portal-closes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerUserId = `speaker-${suffix}`;

const announced = new Date('2027-02-15T23:59:00.000Z');
const draftOnly = new Date('2028-09-09T09:09:00.000Z');

let conferenceId = 0;
let submissionId = 0;

type Loaded = { closesAt: Date | null };

const visit = async (): Promise<Loaded> =>
	(await load({
		params: { id: String(submissionId) },
		locals: { user: { id: speakerUserId } }
	} as unknown as Parameters<typeof load>[0])) as Loaded;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Closes At Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: speakerUserId,
		email: `${speakerUserId}@example.test`,
		emailVerified: true,
		name: 'Priya Raman'
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Closes At Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	// Draft first so a missing status filter plus `orderBy(id)` still fails.
	await db.insert(cfpFormTable).values({
		conferenceId,
		title: 'Next year — unpublished',
		status: 'draft',
		closesAt: draftOnly
	});
	await db.insert(cfpFormTable).values({
		conferenceId,
		title: 'This year',
		status: 'published',
		closesAt: announced
	});

	const [profile] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: speakerUserId,
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: `${speakerUserId}@example.test`
		})
		.returning({ id: speakerProfileTable.id });

	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId, title: 'Build systems without the wait', status: 'in_review' })
		.returning({ id: submissionTable.id });
	submissionId = row.id;

	await db.insert(submissionSpeakerTable).values({
		submissionId,
		speakerProfileId: profile.id,
		isPrimary: true,
		position: 0
	});
});

afterAll(async () => {
	await db
		.delete(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.submissionId, submissionId));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conferenceId));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
	await db.delete(cfpFormTable).where(eq(cfpFormTable.conferenceId, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(user).where(eq(user.id, speakerUserId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('the close instant on a proposal', () => {
	it('quotes the published call when a draft sits beside it', async () => {
		const data = await visit();

		expect(data.closesAt?.toISOString()).toBe(announced.toISOString());
		expect(data.closesAt?.toISOString()).not.toBe(draftOnly.toISOString());
	});
});
