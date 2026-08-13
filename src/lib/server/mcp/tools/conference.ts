import { db } from '$lib/server/db';
import { organizedConferences, requireOrganizer } from '$lib/server/conference/access';
import { conferenceDayTable, roomTable } from '$lib/server/db/conference/conference-schema';
import { submissionStatus, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { reviewTable } from '$lib/server/db/conference/review-schema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { McpToolError, registerMcpTool } from '../tool-helpers';

/**
 * The conference tools — what an agent connected to this server can actually do
 * with the product, as opposed to the identity examples in `profile.ts`.
 *
 * **These reuse `conference/access.ts` rather than checking the organization
 * themselves, and the difference is not cosmetic.** `ctx.organizationId` is the
 * caller's default membership at any role, so scoping by it alone would let a
 * reviewer — or anyone else holding a plain `member` seat — read every abstract
 * and every review comment in the organization. Organizer rights are narrower:
 * an org-wide `owner`/`admin` role, or a per-conference `organizer` membership.
 * `requireOrganizer` is the one function that encodes that, and its own comment
 * calls it the only real permission boundary in the product. A second boundary
 * living here is a boundary that drifts.
 *
 * Tools therefore take a conference **slug**, which is what `requireOrganizer`
 * resolves — and which a model handles better than an opaque integer anyway.
 */
export function registerConferenceTools(server: McpServer, ctx: McpContext): void {
	registerListMyConferences(server, ctx);
	registerListSubmissions(server, ctx);
	registerGetSubmission(server, ctx);
	registerGetAgenda(server, ctx);
}

/**
 * `requireOrganizer` throws a SvelteKit 404 — the right answer for a route and
 * the wrong shape for a tool, which would log it as an unexpected crash. This
 * turns it into the agent-facing refusal without widening what it permits.
 *
 * The message deliberately does not distinguish "no such conference" from "not
 * yours", exactly as the route behaviour does not: two different answers would
 * let an agent learn which slugs exist elsewhere.
 */
async function organizerConference(slug: string, ctx: McpContext) {
	try {
		const { conference } = await requireOrganizer(ctx.userId, slug);
		return conference;
	} catch {
		throw new McpToolError(
			`No conference "${slug}" that you organize. ` +
				'Call list_my_conferences to see the ones you can reach.'
		);
	}
}

function registerListMyConferences(server: McpServer, ctx: McpContext): void {
	registerMcpTool(server, ctx, {
		name: 'list_my_conferences',
		description:
			'List the conferences the authenticated user organizes, newest first. ' +
			'Start here: the slugs returned are what every other conference tool takes.',
		inputSchema: {},
		handler: async () => {
			const rows = await organizedConferences(ctx.userId);

			return {
				count: rows.length,
				conferences: rows.map((conference) => ({
					slug: conference.slug,
					name: conference.name,
					venue: conference.venue,
					startsOn: conference.startsOn,
					endsOn: conference.endsOn,
					status: conference.status
				}))
			};
		}
	});
}

function registerListSubmissions(server: McpServer, ctx: McpContext): void {
	registerMcpTool(server, ctx, {
		name: 'list_submissions',
		description:
			'List the proposals submitted to a conference you organize, newest first, ' +
			'optionally filtered by status. Returns titles and status only — call ' +
			'get_submission for the abstract and its reviews.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_my_conferences.'),
			status: z
				.enum(submissionStatus.enumValues)
				.optional()
				.describe('Only return proposals in this status. Omit for all statuses.'),
			limit: z
				.number()
				.int()
				.min(1)
				.max(200)
				.default(100)
				.describe('Maximum number of proposals to return (1-200).')
		},
		handler: async ({ conferenceSlug, status, limit }) => {
			const conference = await organizerConference(conferenceSlug, ctx);

			const rows = await db
				.select({
					id: submissionTable.id,
					title: submissionTable.title,
					status: submissionTable.status,
					audienceLevel: submissionTable.audienceLevel,
					submittedAt: submissionTable.submittedAt,
					decidedAt: submissionTable.decidedAt
				})
				.from(submissionTable)
				.where(
					status
						? and(
								eq(submissionTable.conferenceId, conference.id),
								eq(submissionTable.status, status)
							)
						: eq(submissionTable.conferenceId, conference.id)
				)
				.orderBy(desc(submissionTable.submittedAt), desc(submissionTable.id))
				.limit(limit);

			return {
				conference: { slug: conference.slug, name: conference.name },
				filteredByStatus: status ?? null,
				count: rows.length,
				submissions: rows.map((row) => ({
					...row,
					submittedAt: row.submittedAt?.toISOString() ?? null,
					decidedAt: row.decidedAt?.toISOString() ?? null
				}))
			};
		}
	});
}

function registerGetSubmission(server: McpServer, ctx: McpContext): void {
	registerMcpTool(server, ctx, {
		name: 'get_submission',
		description:
			'Get one proposal of a conference you organize in full — abstract, key takeaway, ' +
			'status — together with the reviews written for it. Reviewer identities are not returned.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_my_conferences.'),
			submissionId: z.number().int().describe('Submission id, from list_submissions.')
		},
		handler: async ({ conferenceSlug, submissionId }) => {
			// Permission first, then the row — and the row is re-scoped to the
			// conference that was just authorised. Without that second condition a
			// caller could name a conference they organize and an id belonging to
			// one they do not.
			const conference = await organizerConference(conferenceSlug, ctx);

			const [row] = await db
				.select({
					id: submissionTable.id,
					title: submissionTable.title,
					abstract: submissionTable.abstract,
					keyTakeaway: submissionTable.keyTakeaway,
					audienceLevel: submissionTable.audienceLevel,
					status: submissionTable.status,
					submittedAt: submissionTable.submittedAt,
					decidedAt: submissionTable.decidedAt
				})
				.from(submissionTable)
				.where(
					and(
						eq(submissionTable.id, submissionId),
						eq(submissionTable.conferenceId, conference.id)
					)
				)
				.limit(1);

			if (!row) {
				throw new McpToolError(
					`No submission with id ${submissionId} in "${conferenceSlug}". ` +
						'Call list_submissions to see the ones you can reach.'
				);
			}

			// `reviewerUserId` is deliberately not selected. Which reviewers a
			// conference reveals is governed per conference by `reviewVisibility`
			// (`blind_until_reviewed`), and a tool that returned names would decide
			// that question for itself. Withholding identity costs the agent nothing
			// it needs to summarise or triage a proposal — not selected beats not
			// rendered.
			const reviews = await db
				.select({
					id: reviewTable.id,
					status: reviewTable.status,
					comment: reviewTable.comment,
					submittedAt: reviewTable.submittedAt
				})
				.from(reviewTable)
				.where(eq(reviewTable.submissionId, submissionId))
				.orderBy(asc(reviewTable.id));

			return {
				...row,
				conference: { slug: conference.slug, name: conference.name },
				submittedAt: row.submittedAt?.toISOString() ?? null,
				decidedAt: row.decidedAt?.toISOString() ?? null,
				reviewCount: reviews.length,
				reviews: reviews.map((review) => ({
					...review,
					submittedAt: review.submittedAt?.toISOString() ?? null
				}))
			};
		}
	});
}

function registerGetAgenda(server: McpServer, ctx: McpContext): void {
	registerMcpTool(server, ctx, {
		name: 'get_agenda',
		description:
			'Get the scheduled programme of a conference you organize — every placed session, ' +
			'break and reservation in start order, with its day and room. Includes tentative ' +
			'placements, which the public agenda does not show.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_my_conferences.')
		},
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);

			// Left joins throughout: a break carries its own title and has no
			// submission, and a plenary has no room because it spans all of them.
			// Inner joins here would silently drop exactly those rows.
			const rows = await db
				.select({
					id: placementTable.id,
					kind: placementTable.kind,
					status: placementTable.status,
					title: placementTable.title,
					submissionId: placementTable.submissionId,
					submissionTitle: submissionTable.title,
					day: conferenceDayTable.date,
					room: roomTable.name,
					startsAt: placementTable.startsAt,
					endsAt: placementTable.endsAt
				})
				.from(placementTable)
				.leftJoin(submissionTable, eq(submissionTable.id, placementTable.submissionId))
				.leftJoin(conferenceDayTable, eq(conferenceDayTable.id, placementTable.conferenceDayId))
				.leftJoin(roomTable, eq(roomTable.id, placementTable.roomId))
				.where(eq(placementTable.conferenceId, conference.id))
				.orderBy(asc(placementTable.startsAt), asc(placementTable.id));

			return {
				conference: { slug: conference.slug, name: conference.name },
				count: rows.length,
				placements: rows.map((row) => ({
					id: row.id,
					kind: row.kind,
					status: row.status,
					// A session takes its title from the proposal; a break brings its own.
					title: row.submissionTitle ?? row.title,
					submissionId: row.submissionId,
					day: row.day,
					room: row.room,
					startsAt: row.startsAt?.toISOString() ?? null,
					endsAt: row.endsAt?.toISOString() ?? null
				}))
			};
		}
	});
}
