/**
 * Guards the one programme invariant that is enforced by Postgres rather than by
 * application discipline: at most one CONFIRMED placement per submission.
 *
 * AIA-06 drags sessions between slots repeatedly. An application-level rule is exactly
 * the kind that slips when nobody is looking, so it lives in a partial unique index —
 * and this test is what stops someone quietly dropping that index later.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const suffix = `placement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conferenceId: number;
let submissionId: number;
let otherSubmissionId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Placement Test Org',
		slug: organizationId,
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();
	conferenceId = conference.id;

	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId, title: 'A talk that can only be confirmed once' })
		.returning();
	submissionId = submission.id;

	const [other] = await db
		.insert(submissionTable)
		.values({ conferenceId, title: 'A different talk' })
		.returning();
	otherSubmissionId = other.id;
});

afterAll(async () => {
	// Cascades through conference -> submission -> placement.
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('placement: one confirmed placement per submission', () => {
	it('allows the same submission to sit on several tentative slots', async () => {
		await db
			.insert(placementTable)
			.values({ conferenceId, submissionId, kind: 'session', status: 'tentative' });
		await db
			.insert(placementTable)
			.values({ conferenceId, submissionId, kind: 'session', status: 'tentative' });

		const rows = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));

		expect(rows).toHaveLength(2);
	});

	it('rejects a second confirmed placement for the same submission', async () => {
		await db
			.insert(placementTable)
			.values({ conferenceId, submissionId, kind: 'session', status: 'confirmed' });

		// Drizzle wraps the driver error, so the top-level message is the generic
		// "Failed query: ..." and carries no constraint name. The PostgresError with the
		// useful fields sits on `cause` — assert there, on the constraint name and the
		// unique-violation SQLSTATE, rather than on message text.
		type PgError = { constraint_name?: string; code?: string };

		const error = await db
			.insert(placementTable)
			.values({ conferenceId, submissionId, kind: 'session', status: 'confirmed' })
			.then(() => null)
			.catch((e: unknown) => e as { cause?: PgError } | null);

		expect(error).not.toBeNull();
		expect(error?.cause?.constraint_name).toBe('placement_one_confirmed_per_submission');
		expect(error?.cause?.code).toBe('23505');
	});

	it('still allows a confirmed placement for a different submission', async () => {
		await db.insert(placementTable).values({
			conferenceId,
			submissionId: otherSubmissionId,
			kind: 'session',
			status: 'confirmed'
		});

		const rows = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, otherSubmissionId));

		expect(rows).toHaveLength(1);
	});

	it('does not constrain blocks and reservations, which carry no submission', async () => {
		await db
			.insert(placementTable)
			.values({ conferenceId, kind: 'block', status: 'confirmed', title: 'Coffee break' });
		await db
			.insert(placementTable)
			.values({ conferenceId, kind: 'block', status: 'confirmed', title: 'Lunch' });
		await db.insert(placementTable).values({
			conferenceId,
			kind: 'reservation',
			status: 'confirmed',
			title: 'Sponsor slot'
		});

		const rows = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.conferenceId, conferenceId));

		// 2 tentative + 1 confirmed for `submissionId`, 1 for `otherSubmissionId`, 3 without one.
		expect(rows).toHaveLength(7);
	});
});
