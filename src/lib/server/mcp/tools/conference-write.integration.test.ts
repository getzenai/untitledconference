/**
 * Organizer write tools, measured against the isolated harness tenant (#301)
 * and against the loaders a jury would actually hit — not against the column
 * a tool might have written.
 */
import { openCall } from '$lib/server/conference/cfp-submission';
import { deleteConference } from '$lib/server/conference/delete-conference';
import {
	listPublishedConferences,
	loadPublicConference
} from '$lib/server/conference/public-conference';
import { addReviewRound } from '$lib/server/conference/review-rounds';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	roomTable
} from '$lib/server/db/conference/conference-schema';
import { reviewTable } from '$lib/server/db/conference/review-schema';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '../harness';
import { registerConferenceTools } from './conference';

const suffix = `mcpwrite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	registerConferenceTools(
		{
			registerTool(name: string, _config: unknown, callback: Handler) {
				handlers.set(name, callback);
			}
		} as never,
		ctx
	);
	return handlers;
}

async function call(ctx: McpContext, name: string, args: Record<string, unknown> = {}) {
	const handler = toolsFor(ctx).get(name);
	if (!handler) throw new Error(`tool ${name} was not registered`);
	const result = (await handler(args)) as unknown as {
		isError?: boolean;
		content: { text: string }[];
	};
	return {
		isError: result.isError ?? false,
		text: result.content[0].text,
		data: result.isError ? null : JSON.parse(result.content[0].text)
	};
}

let seeded: SeededHarness;
let organizer: McpContext;
let speaker: McpContext;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	speaker = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('organizer write tools', () => {
	it('registers every write tool the issue names', () => {
		const names = [...toolsFor(organizer).keys()];
		expect(names).toEqual(
			expect.arrayContaining([
				'create_conference',
				'update_conference',
				'open_cfp',
				'close_cfp',
				'publish_conference',
				'unpublish_conference',
				'delete_conference',
				'invite_reviewer',
				'assign_reviews'
			])
		);
	});

	it('creates a draft through createConference — days exist, the public site does not', async () => {
		const slug = `mcp-write-created-${suffix}`;
		const { data, isError } = await call(organizer, 'create_conference', {
			name: 'Write Tools Conf',
			slug,
			startsOn: '2027-11-01',
			endsOn: '2027-11-02',
			venue: 'Tool Lab'
		});

		expect(isError).toBe(false);
		expect(data).toMatchObject({ slug, venue: 'Tool Lab', status: 'draft' });
		expect(await loadPublicConference(slug)).toBeNull();
		expect((await listPublishedConferences()).some((row) => row.slug === slug)).toBe(false);

		const listed = await call(organizer, 'list_my_conferences');
		expect((listed.data!.conferences as { slug: string }[]).map((row) => row.slug)).toContain(slug);
	});

	it('refuses a speaker who is only a member of the organization', async () => {
		const result = await call(speaker, 'publish_conference', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain('that you organize');
	});

	it('updates dates through the same path Settings uses — days follow the range', async () => {
		const { data } = await call(organizer, 'update_conference', {
			conferenceSlug: seeded.conferenceSlug,
			startsOn: '2027-10-06',
			endsOn: '2027-10-08',
			venue: 'Moved Lab'
		});

		expect(data!.venue).toBe('Moved Lab');
		expect(data!.daysAdded).toEqual(['2027-10-08']);
		expect(data!.daysRemoved).toEqual([]);
	});

	it('opens the call, publishes, then returns to draft — the three public surfaces agree', async () => {
		const opened = await call(organizer, 'open_cfp', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(opened.data!.form.status).toBe('published');
		expect(opened.data!.publicCallLive).toBe(false);
		expect(await openCall(seeded.conferenceSlug)).toBeNull();
		expect(await loadPublicConference(seeded.conferenceSlug)).toBeNull();

		const published = await call(organizer, 'publish_conference', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(published.data).toMatchObject({ status: 'published', changed: true });
		expect((await loadPublicConference(seeded.conferenceSlug))?.slug).toBe(seeded.conferenceSlug);
		expect((await openCall(seeded.conferenceSlug))?.conference.slug).toBe(seeded.conferenceSlug);
		expect(
			(await listPublishedConferences()).some((row) => row.slug === seeded.conferenceSlug)
		).toBe(true);

		const again = await call(organizer, 'publish_conference', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(again.data).toMatchObject({ status: 'published', changed: false });

		const draft = await call(organizer, 'unpublish_conference', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(draft.data).toMatchObject({ status: 'draft', changed: true });
		expect(await loadPublicConference(seeded.conferenceSlug)).toBeNull();
		expect(await openCall(seeded.conferenceSlug)).toBeNull();
		expect(
			(await listPublishedConferences()).some((row) => row.slug === seeded.conferenceSlug)
		).toBe(false);
	});

	it('closes the call through closeCfpForm', async () => {
		const { data } = await call(organizer, 'close_cfp', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(data!.form.status).toBe('closed');
	});

	it('invites a harness reviewer through addReviewer, then assigns via assignReviewerToSubmissions', async () => {
		const ellis = seeded.people.find((person) => person.role === 'reviewer')!;
		const invited = await call(organizer, 'invite_reviewer', {
			conferenceSlug: seeded.conferenceSlug,
			email: ellis.email
		});
		expect(invited.isError).toBe(false);
		expect(invited.data!.added).toBe(true);

		const [seat] = await db
			.select({ id: membershipTable.id })
			.from(membershipTable)
			.where(
				and(
					eq(membershipTable.userId, ellis.id),
					eq(membershipTable.role, 'reviewer'),
					eq(membershipTable.scopeType, 'conference'),
					eq(membershipTable.scopeId, seeded.conferenceId)
				)
			);
		expect(seat).toBeTruthy();

		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId: seeded.conferenceId,
				title: 'Harness talk',
				abstract: 'For assign_reviews.',
				status: 'submitted'
			})
			.returning({ id: submissionTable.id });

		const round = await addReviewRound(seeded.conferenceId, {
			name: 'Screening',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const assigned = await call(organizer, 'assign_reviews', {
			conferenceSlug: seeded.conferenceSlug,
			submissionIds: [submission.id],
			reviewerEmail: ellis.email,
			roundId: round.id
		});

		expect(assigned.isError).toBe(false);
		expect(assigned.data).toMatchObject({ created: 1, already: 0 });

		const reviews = await db
			.select({ id: reviewTable.id, reviewerUserId: reviewTable.reviewerUserId })
			.from(reviewTable)
			.where(eq(reviewTable.submissionId, submission.id))
			.orderBy(asc(reviewTable.id));
		expect(reviews).toHaveLength(1);
		expect(reviews[0].reviewerUserId).toBe(ellis.id);
	});
});

/**
 * #324. The leftovers of a test run have to be removable, and the removal has to
 * be hard to do by accident and impossible to do to someone's live event.
 */
describe('delete_conference', () => {
	/** A fresh draft with a room and a submission under it, plus its id. */
	async function draftWithContents(slug: string) {
		const created = await call(organizer, 'create_conference', {
			name: `Deletable ${slug}`,
			slug,
			startsOn: '2027-11-01',
			endsOn: '2027-11-01'
		});
		expect(created.isError).toBe(false);

		const [conference] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, slug));

		await db.insert(roomTable).values({ conferenceId: conference.id, name: 'Main hall' });
		await db.insert(submissionTable).values({
			conferenceId: conference.id,
			title: 'Left behind',
			abstract: 'From a test run.',
			status: 'rejected'
		});

		return conference.id;
	}

	it('deletes a draft and everything the schema hangs off it', async () => {
		const slug = `${suffix}-delete-me`;
		const conferenceId = await draftWithContents(slug);

		const { isError, data } = await call(organizer, 'delete_conference', {
			conferenceSlug: slug,
			confirmSlug: slug
		});

		expect(isError).toBe(false);
		expect(data).toMatchObject({ slug, deleted: true });
		expect(data!.removed).toMatchObject({ rooms: 1, submissions: 1, speakers: 0 });

		// Gone from the picker an organizer reads, and gone from the cascade below it.
		const listed = await call(organizer, 'list_my_conferences');
		expect((listed.data!.conferences as { slug: string }[]).map((row) => row.slug)).not.toContain(
			slug
		);
		expect(
			await db.select().from(conferenceTable).where(eq(conferenceTable.id, conferenceId))
		).toHaveLength(0);
		expect(
			await db.select().from(roomTable).where(eq(roomTable.conferenceId, conferenceId))
		).toHaveLength(0);
		expect(
			await db.select().from(submissionTable).where(eq(submissionTable.conferenceId, conferenceId))
		).toHaveLength(0);
	});

	it('refuses a confirmSlug that does not match, and deletes nothing', async () => {
		const slug = `${suffix}-mistyped`;
		await draftWithContents(slug);

		const result = await call(organizer, 'delete_conference', {
			conferenceSlug: slug,
			confirmSlug: `${slug}-oops`
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain('does not match');
		expect(
			await db.select().from(conferenceTable).where(eq(conferenceTable.slug, slug))
		).toHaveLength(1);
	});

	it('refuses a published conference — unpublishing first is the organizer’s decision, not a step it takes', async () => {
		const slug = `${suffix}-published`;
		await draftWithContents(slug);
		await call(organizer, 'publish_conference', { conferenceSlug: slug });

		const result = await call(organizer, 'delete_conference', {
			conferenceSlug: slug,
			confirmSlug: slug
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain('only a draft can be deleted');
		expect(
			await db.select().from(conferenceTable).where(eq(conferenceTable.slug, slug))
		).toHaveLength(1);
	});

	it('refuses an organizer who was added to the one event but holds no org-wide seat', async () => {
		const slug = `${suffix}-scoped`;
		const conferenceId = await draftWithContents(slug);
		const helper = seeded.speakerIds[1];
		await db.insert(membershipTable).values({
			userId: helper,
			role: 'organizer',
			scopeType: 'conference',
			scopeId: conferenceId
		});
		const scopedOrganizer: McpContext = { userId: helper, organizationId: seeded.orgId };

		// They really do organize it: the same conference answers their write tools.
		const renamed = await call(scopedOrganizer, 'update_conference', {
			conferenceSlug: slug,
			venue: 'Their venue'
		});
		expect(renamed.isError).toBe(false);

		const result = await call(scopedOrganizer, 'delete_conference', {
			conferenceSlug: slug,
			confirmSlug: slug
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain('owner or admin seat');
		expect(
			await db.select().from(conferenceTable).where(eq(conferenceTable.slug, slug))
		).toHaveLength(1);
	});

	/**
	 * The draft check runs twice — once on the row that was read, once as a
	 * predicate on the delete itself. Only the second one survives a publish that
	 * lands in between, and the only way to measure it is to hand the function a
	 * row that is already out of date, which is exactly what a race produces.
	 */
	it('refuses a row that says draft when the conference has since been published', async () => {
		const slug = `${suffix}-raced`;
		const conferenceId = await draftWithContents(slug);
		const [stale] = await db
			.select()
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conferenceId));
		expect(stale.status).toBe('draft');

		await call(organizer, 'publish_conference', { conferenceSlug: slug });

		const result = await deleteConference(stale, seeded.organizerId);

		expect(result).toEqual({ ok: false, reason: 'not_draft' });
		expect(
			await db.select().from(conferenceTable).where(eq(conferenceTable.id, conferenceId))
		).toHaveLength(1);
	});
});
