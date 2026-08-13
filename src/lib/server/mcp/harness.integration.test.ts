/**
 * Measures the isolation #301 is betting on, not the column the seed wrote.
 *
 * A draft conference is publicly 404 and absent from the landing grid — that
 * is the same pair last night's Return-to-draft check used on the juror
 * throwaways. The consumers here are the loaders the public site and `/`
 * actually call. Asserting `status === 'draft'` alone would pass even if
 * those loaders stopped filtering.
 *
 * The fixture is hermetic (suffixed ids) so this file cannot pass by reading
 * a leftover from `seed-mcp-harness.mjs` on a shared database, and cannot
 * collide with DevFlow or the AI Engineer import.
 */
import { openCall } from '$lib/server/conference/cfp-submission';
import {
	listPublishedConferences,
	loadPublicConference
} from '$lib/server/conference/public-conference';
import { assignReviewerToSubmissions } from '$lib/server/conference/review-management';
import { addReviewRound } from '$lib/server/conference/review-rounds';
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceDayTable, conferenceTable } from '$lib/server/db/conference/conference-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	FOREIGN_ORG_IDS,
	MCP_HARNESS,
	MCP_HARNESS_EMAIL_DOMAIN,
	seedMcpHarness,
	wipeMcpHarness,
	type SeededHarness
} from './harness';

const suffix = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

async function storedStatus() {
	const [row] = await db
		.select({ status: conferenceTable.status })
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, seeded.conferenceSlug));
	return row?.status ?? null;
}

describe('the MCP harness playground', () => {
	it('is its own organisation, not a row on DevFlow or the AI Engineer import', async () => {
		expect(FOREIGN_ORG_IDS).not.toContain(seeded.orgId);

		const [org] = await db
			.select({ id: organization.id, name: organization.name, slug: organization.slug })
			.from(organization)
			.where(eq(organization.id, seeded.orgId));

		expect(org).toEqual({
			id: seeded.orgId,
			name: MCP_HARNESS.orgName,
			slug: seeded.orgSlug
		});

		const foreigners = await db
			.select({ id: organization.id })
			.from(organization)
			.where(inArray(organization.id, [...FOREIGN_ORG_IDS]));
		// The shared test database may or may not have those tenants. What this
		// file must never do is write one of their ids — the seed used `seeded.orgId`.
		expect(foreigners.map((row) => row.id)).not.toContain(seeded.orgId);
	});

	it('signs its five accounts into @mcpharness.example', () => {
		expect(seeded.people).toHaveLength(5);
		expect(seeded.people.map((person) => person.role).sort()).toEqual(
			['organizer', 'reviewer', 'reviewer', 'speaker', 'speaker'].sort()
		);
		for (const person of seeded.people) {
			expect(person.email.endsWith(`@${MCP_HARNESS_EMAIL_DOMAIN}`)).toBe(true);
		}
	});

	it('is born a draft — the public site, the call and the landing grid all miss it', async () => {
		expect(await storedStatus()).toBe('draft');
		expect(await loadPublicConference(seeded.conferenceSlug)).toBeNull();
		expect(await openCall(seeded.conferenceSlug)).toBeNull();
		expect(
			(await listPublishedConferences()).some(
				(conference) => conference.slug === seeded.conferenceSlug
			)
		).toBe(false);
	});

	it('creates days the same way /manage/new does', async () => {
		const days = await db
			.select({ date: conferenceDayTable.date, position: conferenceDayTable.position })
			.from(conferenceDayTable)
			.where(eq(conferenceDayTable.conferenceId, seeded.conferenceId))
			.orderBy(asc(conferenceDayTable.position));

		expect(days).toEqual([
			{ date: MCP_HARNESS.startsOn, position: 0 },
			{ date: MCP_HARNESS.endsOn, position: 1 }
		]);
	});

	it('is invisible because it is a draft, not because of its name or organisation', async () => {
		// A published call, so the only thing standing between a speaker and the
		// form is the conference's own status — same setup the settings visibility
		// test uses. Without it, `openCall` is null for two reasons at once.
		await db.insert(cfpFormTable).values({
			conferenceId: seeded.conferenceId,
			title: 'Harness call',
			status: 'published'
		});

		expect(await openCall(seeded.conferenceSlug)).toBeNull();

		await db
			.update(conferenceTable)
			.set({ status: 'published' })
			.where(eq(conferenceTable.id, seeded.conferenceId));

		expect((await loadPublicConference(seeded.conferenceSlug))?.slug).toBe(seeded.conferenceSlug);
		expect((await openCall(seeded.conferenceSlug))?.conference.slug).toBe(seeded.conferenceSlug);
		expect(
			(await listPublishedConferences()).some(
				(conference) => conference.slug === seeded.conferenceSlug
			)
		).toBe(true);

		await db
			.update(conferenceTable)
			.set({ status: 'draft' })
			.where(eq(conferenceTable.id, seeded.conferenceId));

		expect(await loadPublicConference(seeded.conferenceSlug)).toBeNull();
		expect(await openCall(seeded.conferenceSlug)).toBeNull();
		expect(
			(await listPublishedConferences()).some(
				(conference) => conference.slug === seeded.conferenceSlug
			)
		).toBe(false);
	});
});

/**
 * #340: the guard in `assign_reviews` is not the thing under test — the write
 * behind it is. With only the organizer's own proposals in the tenant, every
 * assignment was refused as a speaker conflict and `submit_review` could never
 * be reached. These proposals have somebody else's name on them.
 */
describe('the seeded proposals', () => {
	it('let the organizer be assigned a review without a conflict — and still refuse the author', async () => {
		const round = await addReviewRound(seeded.conferenceId, {
			name: 'Harness round',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const organizer = seeded.people.find((person) => person.role === 'organizer')!;
		expect((await addReviewer(seeded.conferenceId, organizer.email)).ok).toBe(true);

		const submissionId = seeded.submissionIds['casey-observability'];
		expect(submissionId).toBeGreaterThan(0);

		expect(
			await assignReviewerToSubmissions(seeded.conferenceId, [submissionId], round.id, organizer.id)
		).toEqual({ created: 1, already: 0, skipped: 0, recused: 0, skippedItems: [] });

		// The other half of the same measurement: the guard still fires for the
		// person who wrote it, so a passing assignment above is not the guard
		// having been switched off.
		const author = seeded.people.find((person) => person.id.includes('casey'))!;
		expect((await addReviewer(seeded.conferenceId, author.email)).ok).toBe(true);
		expect(
			await assignReviewerToSubmissions(seeded.conferenceId, [submissionId], round.id, author.id)
		).toEqual({
			created: 0,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId, reason: 'speaker_conflict' }]
		});
	});
});
