import { organizedConferences } from '$lib/server/conference/access';
import { slotMinutes } from '$lib/server/conference/agenda';
import { decideSubmissions } from '$lib/server/conference/decisions';
import { db } from '$lib/server/db';
import { submissionStatus, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceDayTable, roomTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { reviewTable } from '$lib/server/db/conference/review-schema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { organizerConference } from '../organizer';
import { McpToolError, registerMcpTools, type AnyMcpToolDefinition } from '../tool-helpers';
import { agendaTools, formatClock } from './agenda';
import { conferenceWriteTools } from './conference-write';

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
export function conferenceReadTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [
		listMyConferences(ctx),
		listConferences(ctx),
		getConference(ctx),
		listSubmissions(ctx),
		getSubmission(ctx),
		getAgenda(ctx),
		listSessions(ctx),
		decideSubmissionsTool(ctx)
	];
}

export function conferenceTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [...conferenceReadTools(ctx), ...conferenceWriteTools(ctx), ...agendaTools(ctx)];
}

export function registerConferenceTools(server: McpServer, ctx: McpContext): void {
	registerMcpTools(server, ctx, conferenceTools(ctx));
}

function conferenceCard(conference: {
	slug: string;
	name: string;
	venue: string | null;
	startsOn: string | null;
	endsOn: string | null;
	status: string;
}) {
	return {
		slug: conference.slug,
		name: conference.name,
		venue: conference.venue,
		startsOn: conference.startsOn,
		endsOn: conference.endsOn,
		status: conference.status
	};
}

async function organizedConferenceList(ctx: McpContext) {
	const rows = await organizedConferences(ctx.userId);
	return {
		count: rows.length,
		conferences: rows.map(conferenceCard)
	};
}

function listMyConferences(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_my_conferences',
		writes: false,
		description:
			'List the conferences the authenticated user organizes, newest first. ' +
			'Start here: the slugs returned are what every other conference tool takes. ' +
			'Archived conferences are listed too, with status "archived" — they are hidden ' +
			'from the public, not from their organizers, and restore_conference brings one back.',
		inputSchema: {},
		handler: () => organizedConferenceList(ctx)
	};
}

function listConferences(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_conferences',
		writes: false,
		description:
			'List the conferences the authenticated user organizes, newest first. ' +
			'Same list as list_my_conferences. A caller who organizes nothing gets an empty list, ' +
			"never another organization's events.",
		inputSchema: {},
		handler: () => organizedConferenceList(ctx)
	};
}

function getConference(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_conference',
		writes: false,
		description:
			'Get one conference you organize — name, venue, dates, status. ' +
			'Unknown slugs and slugs you do not organize are the same answer.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_conferences.')
		},
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			return conferenceCard(conference);
		}
	};
}

function listSubmissions(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_submissions',
		writes: false,
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
	};
}

function getSubmission(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_submission',
		writes: false,
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
					and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conference.id))
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
	};
}

async function scheduledProgramme(conferenceSlug: string, ctx: McpContext) {
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
			// Not an ISO instant. `slotInstant` stores the conference's own wall
			// clock as if it were UTC, so `toISOString()` here produced a `Z` the
			// value never earned: 14:00 in Munich came out as 14:00Z, an hour off
			// for any client honest enough to parse it (#325). Reading the same
			// clock back out with `slotMinutes` and handing over day + HH:MM
			// leaves nothing to misread, and matches what place_talk and
			// get_agenda_tray already return for the same placement.
			startMinutes: row.startsAt ? slotMinutes(row.startsAt) : null,
			start: row.startsAt ? formatClock(slotMinutes(row.startsAt)) : null,
			endMinutes: row.endsAt ? slotMinutes(row.endsAt) : null,
			end: row.endsAt ? formatClock(slotMinutes(row.endsAt)) : null
		}))
	};
}

function getAgenda(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_agenda',
		writes: false,
		description:
			'Get the scheduled programme of a conference you organize — every placed session, ' +
			'break and reservation in start order, with its day and room. Includes tentative ' +
			'placements, which the public agenda does not show. Times are the conference clock: ' +
			'a day (YYYY-MM-DD) plus start/end as HH:MM, the same pair place_talk and ' +
			'get_agenda_tray use. There is no timezone here — 14:00 is 14:00 in the room.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_my_conferences.')
		},
		handler: ({ conferenceSlug }) => scheduledProgramme(conferenceSlug, ctx)
	};
}

function listSessions(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_sessions',
		writes: false,
		description:
			'List the scheduled programme of a conference you organize — day, room, start ' +
			'and session, in start order. Same placements as get_agenda, including tentative ' +
			'ones the public page hides.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_conferences.')
		},
		handler: ({ conferenceSlug }) => scheduledProgramme(conferenceSlug, ctx)
	};
}

function decideSubmissionsTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'decide_submissions',
		writes: true,
		description:
			'Accept, reject, waitlist, or ask a speaker to resubmit with guidance. ' +
			'Accepting also places the talk in the agenda tray, confirms its speakers and creates ' +
			'their tasks; taking an acceptance back undoes those. Speakers are NOT emailed — ' +
			'notifying them is a separate organizer action. Deciding the same way twice changes ' +
			'nothing. Proposals still in draft are skipped and counted under skippedDrafts: they ' +
			'were never handed in, and only the speaker can do that. resubmit_with_guidance needs ' +
			'guidance — it is not a decline wearing a note.',
		inputSchema: {
			conferenceSlug: z.string().min(1).describe('Conference slug, from list_my_conferences.'),
			submissionIds: z
				.array(z.number().int())
				.min(1)
				.max(100)
				.describe('Submission ids to decide, from list_submissions (1-100).'),
			decision: z
				.enum(['accepted', 'rejected', 'waitlisted', 'resubmit_with_guidance'])
				.describe('The decision to apply to every listed proposal.'),
			guidance: z
				.string()
				.optional()
				.describe('Required when asking them to resubmit: what they should do differently.'),
			declineNote: z
				.string()
				.optional()
				.describe('Optional one sentence from the champion on a decline. Empty sends nothing.')
		},
		handler: async ({ conferenceSlug, submissionIds, decision, guidance, declineNote }) => {
			const conference = await organizerConference(conferenceSlug, ctx);

			// `decideSubmissions` is the same function the organizer screen calls, and
			// reusing it is the point rather than convenience: a decision is not a
			// status column. Accepting also opens an agenda slot, confirms the
			// speakers onto the conference and generates their tasks — all in one
			// transaction. A tool that wrote `status` itself would leave a talk
			// accepted with no session and no tasks, which nothing on screen would
			// report as missing.
			//
			// It scopes its own update to `conference.id`, so an id belonging to
			// another conference is silently not decided rather than decided wrongly.
			const sentence =
				decision === 'resubmit_with_guidance'
					? (guidance ?? null)
					: decision === 'rejected'
						? (declineNote ?? null)
						: null;
			let result;
			try {
				result = await decideSubmissions(conference, submissionIds, decision, null, sentence);
			} catch (error) {
				if (error instanceof Error && error.message === 'missing_guidance') {
					throw new McpToolError('Say what they should do differently.');
				}
				throw error;
			}

			return {
				conference: { slug: conference.slug, name: conference.name },
				decision,
				requested: submissionIds.length,
				...result,
				// What is left once every accounted-for reason is taken out: ids already
				// carrying this decision (`unchanged`), ids the speaker never handed in
				// (`skippedDrafts`, from the spread above), and this — ids that are not
				// in this conference at all.
				notDecided: submissionIds.length - result.decided - result.unchanged - result.skippedDrafts
			};
		}
	};
}
