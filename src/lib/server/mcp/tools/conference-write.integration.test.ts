/**
 * Organizer write tools, measured against the isolated harness tenant (#301)
 * and against the loaders a jury would actually hit — not against the column
 * a tool might have written.
 */
import { openCall } from '$lib/server/conference/cfp-submission';
import {
	listPublishedConferences,
	loadPublicConference
} from '$lib/server/conference/public-conference';
import { addReviewRound } from '$lib/server/conference/review-rounds';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { membershipTable } from '$lib/server/db/conference/conference-schema';
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
				'invite_reviewer',
				'assign_reviews',
				'create_review_round',
				'list_review_rounds',
				'create_session_format',
				'list_session_formats',
				'create_track',
				'list_tracks'
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

	it('creates a review round through addReviewRound — assign_reviews then finds it', async () => {
		const slug = `mcp-write-round-${suffix}`;
		const created = await call(organizer, 'create_conference', {
			name: 'Round Tools Conf',
			slug,
			startsOn: '2027-12-01',
			endsOn: '2027-12-02',
			venue: null
		});
		expect(created.isError).toBe(false);

		const empty = await call(organizer, 'list_review_rounds', { conferenceSlug: slug });
		expect(empty.data).toMatchObject({ count: 0, rounds: [] });

		const ellis = seeded.people.find((person) => person.role === 'reviewer')!;
		await call(organizer, 'invite_reviewer', { conferenceSlug: slug, email: ellis.email });

		const missing = await call(organizer, 'assign_reviews', {
			conferenceSlug: slug,
			submissionIds: [1],
			reviewerEmail: ellis.email
		});
		expect(missing.isError).toBe(true);
		expect(missing.text).toContain('create_review_round');

		const round = await call(organizer, 'create_review_round', {
			conferenceSlug: slug,
			name: 'Screening',
			anonymized: false
		});
		expect(round.isError).toBe(false);
		expect(round.data).toMatchObject({
			created: true,
			round: { name: 'Screening', anonymized: false, window: 'open' }
		});
		expect(round.data!.round).toEqual(expect.objectContaining({ id: expect.any(Number) }));

		const listed = await call(organizer, 'list_review_rounds', { conferenceSlug: slug });
		expect(listed.data!.count).toBe(1);
		expect(listed.data!.rounds).toEqual([
			expect.objectContaining({
				id: (round.data!.round as { id: number }).id,
				name: 'Screening',
				window: 'open'
			})
		]);
	});

	it('creates a format and a track the public call then lists', async () => {
		const slug = `mcp-write-shape-${suffix}`;
		await call(organizer, 'create_conference', {
			name: 'Shape Tools Conf',
			slug,
			startsOn: '2027-12-03',
			endsOn: '2027-12-04',
			venue: null
		});

		const noFormats = await call(organizer, 'list_session_formats', { conferenceSlug: slug });
		const noTracks = await call(organizer, 'list_tracks', { conferenceSlug: slug });
		expect(noFormats.data).toMatchObject({ count: 0, formats: [] });
		expect(noTracks.data).toMatchObject({ count: 0, tracks: [] });

		const format = await call(organizer, 'create_session_format', {
			conferenceSlug: slug,
			name: 'Talk',
			minutes: 30
		});
		const track = await call(organizer, 'create_track', {
			conferenceSlug: slug,
			name: 'Platform'
		});
		expect(format.isError).toBe(false);
		expect(track.isError).toBe(false);
		expect(format.data).toMatchObject({
			created: true,
			format: { name: 'Talk', minutes: 30 }
		});
		expect(track.data).toMatchObject({ created: true, track: { name: 'Platform' } });

		const formats = await call(organizer, 'list_session_formats', { conferenceSlug: slug });
		const tracks = await call(organizer, 'list_tracks', { conferenceSlug: slug });
		expect(formats.data!.formats).toEqual([
			expect.objectContaining({
				id: (format.data!.format as { id: number }).id,
				name: 'Talk',
				minutes: 30
			})
		]);
		expect(tracks.data!.tracks).toEqual([
			expect.objectContaining({
				id: (track.data!.track as { id: number }).id,
				name: 'Platform'
			})
		]);

		const twice = await call(organizer, 'create_session_format', {
			conferenceSlug: slug,
			name: 'talk',
			minutes: 45
		});
		expect(twice.isError).toBe(true);
		expect(twice.text).toContain('already exists');
	});
});
