/**
 * "Have we had them before?" against the real database (#451, layer 1).
 *
 * Every test here is one way the answer could be wrong in a decision meeting,
 * and each fails on its own:
 *
 * - counting an acceptance that never made it onto the grid,
 * - counting an edition that has not happened yet,
 * - counting somebody else's conference,
 * - counting the very talk being decided,
 * - dropping a first-timer instead of saying they are one.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { speakerHistoryForSubmission } from './speaker-history';

const suffix = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const otherOrganizationId = `org-other-${suffix}`;

/** This year's event, the one being decided. */
let current: Conference;
/** Two editions that are over, and one that has not happened yet. */
let past2024: Conference;
let past2025: Conference;
let future: Conference;
/** Another organization's event — a speaker's record there is not ours to show. */
let foreign: Conference;

let ada: number;
let grace: number;
let submissionId: number;

async function conference(
	orgId: string,
	name: string,
	slug: string,
	startsOn: string | null,
	endsOn: string | null
): Promise<Conference> {
	const [row] = await db
		.insert(conferenceTable)
		.values({ organizationId: orgId, name, slug, startsOn, endsOn })
		.returning();
	return row;
}

/** A talk at `conf` with `speakerProfileId` on it, optionally on the grid. */
async function talk(
	conf: Conference,
	title: string,
	speakerProfileId: number,
	placement: 'confirmed' | 'tentative' | 'none'
): Promise<number> {
	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId: conf.id, title, status: 'accepted' })
		.returning();
	await db
		.insert(submissionSpeakerTable)
		.values({ submissionId: submission.id, speakerProfileId, isPrimary: true });
	if (placement !== 'none') {
		await db
			.insert(placementTable)
			.values({ conferenceId: conf.id, submissionId: submission.id, status: placement });
	}
	return submission.id;
}

beforeAll(async () => {
	for (const id of [organizationId, otherOrganizationId]) {
		await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
	}

	current = await conference(organizationId, 'Untitled 2026', suffix, '2026-09-01', '2026-09-03');
	past2024 = await conference(
		organizationId,
		'Untitled 2024',
		`${suffix}-2024`,
		'2024-09-02',
		'2024-09-04'
	);
	past2025 = await conference(
		organizationId,
		'Untitled 2025',
		`${suffix}-2025`,
		'2025-09-01',
		'2025-09-03'
	);
	// Dated after the current edition, so "has ended" is doing the work and not
	// some accidental ordering by id.
	future = await conference(
		organizationId,
		'Untitled 2027',
		`${suffix}-2027`,
		'2027-09-01',
		'2027-09-03'
	);
	foreign = await conference(
		otherOrganizationId,
		'Someone Else 2025',
		`${suffix}-foreign`,
		'2025-05-01',
		'2025-05-02'
	);

	[{ id: ada }] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Ada Lovelace', sortName: 'Lovelace, Ada' })
		.returning({ id: speakerProfileTable.id });
	[{ id: grace }] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Grace Hopper', sortName: 'Hopper, Grace' })
		.returning({ id: speakerProfileTable.id });
});

beforeEach(async () => {
	for (const conf of [current, past2024, past2025, future, foreign]) {
		await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conf.id));
	}
	// The talk under decision: Ada leading, Grace as co-presenter.
	submissionId = await talk(current, 'This year’s proposal', ada, 'none');
	await db.insert(submissionSpeakerTable).values({ submissionId, speakerProfileId: grace });
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(organization).where(eq(organization.id, otherOrganizationId));
});

describe('speakerHistoryForSubmission', () => {
	it('reports every speaker on the talk, first-timers included', async () => {
		const history = await speakerHistoryForSubmission(current, submissionId);

		expect(history.map((h) => h.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
		expect(history.every((h) => h.appearances.length === 0)).toBe(true);
	});

	it('counts confirmed placements at past editions, newest first', async () => {
		await talk(past2024, 'Analytical engines', ada, 'confirmed');
		await talk(past2025, 'Notes on note G', ada, 'confirmed');

		const [record] = await speakerHistoryForSubmission(current, submissionId);

		expect(record.appearances.map((a) => a.talkTitle)).toEqual([
			'Notes on note G',
			'Analytical engines'
		]);
		expect(record.appearances.map((a) => a.year)).toEqual([2025, 2024]);
		expect(record.appearances[0].conferenceName).toBe('Untitled 2025');
	});

	it('ignores a talk that was accepted but never placed on the grid', async () => {
		// The strongest way to be wrong: an acceptance that fell through reads as a
		// talk they gave. Only the published grid is evidence they spoke.
		await talk(past2025, 'Withdrawn after acceptance', ada, 'none');
		await talk(past2024, 'Parked on a slot, never confirmed', ada, 'tentative');

		const [record] = await speakerHistoryForSubmission(current, submissionId);

		expect(record.appearances).toEqual([]);
	});

	it('ignores an edition that has not happened yet', async () => {
		await talk(future, 'Already on next year’s grid', ada, 'confirmed');

		const [record] = await speakerHistoryForSubmission(current, submissionId);

		expect(record.appearances).toEqual([]);
	});

	it('ignores another organization’s conference', async () => {
		await talk(foreign, 'Spoke at a rival event', ada, 'confirmed');

		const [record] = await speakerHistoryForSubmission(current, submissionId);

		expect(record.appearances).toEqual([]);
	});

	it('never counts the conference being decided', async () => {
		// A talk already placed at this edition — a second submission from the same
		// speaker — is this year's business, not history.
		await talk(current, 'Their other talk this year', ada, 'confirmed');

		const [record] = await speakerHistoryForSubmission(current, submissionId);

		expect(record.appearances).toEqual([]);
	});

	it('keeps the two speakers’ records apart', async () => {
		await talk(past2025, 'Ada’s talk', ada, 'confirmed');
		await talk(past2024, 'Grace’s talk', grace, 'confirmed');

		const [adaRecord, graceRecord] = await speakerHistoryForSubmission(current, submissionId);

		expect(adaRecord.appearances.map((a) => a.talkTitle)).toEqual(['Ada’s talk']);
		expect(graceRecord.appearances.map((a) => a.talkTitle)).toEqual(['Grace’s talk']);
	});

	it('has nothing to say about a submission with no speakers', async () => {
		const [orphan] = await db
			.insert(submissionTable)
			.values({ conferenceId: current.id, title: 'Nobody attached', status: 'submitted' })
			.returning();

		expect(await speakerHistoryForSubmission(current, orphan.id)).toEqual([]);
	});
});
