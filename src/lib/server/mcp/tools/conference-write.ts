/**
 * Organizer write tools (#298). Each one calls the same function the screen
 * calls — never a column. Definitions live in an exported list so the MCP
 * adapter (and later REST) is a loop, not a second implementation.
 */
import { closeCfpForm, createCfpForm, publishCfpForm } from '$lib/server/conference/cfp-form';
import { createConference } from '$lib/server/conference/create-conference';
import { assignReviewerToSubmissions } from '$lib/server/conference/review-management';
import { reviewRounds } from '$lib/server/conference/review-rounds';
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import { updateConference } from '$lib/server/conference/update-conference';
import { setConferenceVisibility } from '$lib/server/conference/visibility';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { organizerConference } from '../organizer';
import { McpToolError, type AnyMcpToolDefinition } from '../tool-helpers';

const slugField = z
	.string()
	.min(1)
	.describe('Conference slug, from list_my_conferences or create_conference.');

const isoInstant = z
	.string()
	.min(1)
	.describe('ISO-8601 instant (e.g. 2027-10-01T09:00:00.000Z). Omit to leave the current value.');

function parseInstant(value: string | undefined, label: string): Date | undefined {
	if (value === undefined) return undefined;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new McpToolError(`${label} is not a real instant. Use ISO-8601.`);
	}
	return date;
}

function createConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_conference',
		description:
			'Create a new conference as a draft under the organization you own. ' +
			'It is not public until you call publish_conference. The slug becomes the ' +
			'public address /c/<slug> and is what every other conference tool takes. ' +
			'Does not take a user or organization — identity comes from the access token.',
		inputSchema: {
			name: z.string().min(1).max(120).describe('Conference name.'),
			slug: z.string().min(1).describe('Public address. Lowercase letters, digits and hyphens.'),
			startsOn: z.string().nullable().describe('First day, YYYY-MM-DD. Null if unset.'),
			endsOn: z.string().nullable().describe('Last day, YYYY-MM-DD. Null if unset.'),
			venue: z.string().nullable().optional().describe('Venue name. Optional.')
		},
		handler: async ({ name, slug, startsOn, endsOn, venue }) => {
			const result = await createConference(ctx.userId, {
				name,
				slug,
				startsOn,
				endsOn,
				venue: venue ?? null
			});
			if (!result.ok) {
				if (result.reason === 'no_organization') {
					throw new McpToolError(
						'You do not own an organization, so you cannot create a conference.'
					);
				}
				if (result.reason === 'slug_taken') {
					throw new McpToolError(`The address "${slug}" is already taken. Try another slug.`);
				}
				if (result.reason === 'slug_reserved') {
					throw new McpToolError('The slug "new" is reserved. Pick another address.');
				}
				throw new McpToolError(
					result.field === 'name'
						? 'Give the conference a name (at most 120 characters).'
						: 'Check the dates — use YYYY-MM-DD, with the end on or after the start.'
				);
			}
			return {
				slug: result.conference.slug,
				name: result.conference.name,
				venue: result.conference.venue,
				startsOn: result.conference.startsOn,
				endsOn: result.conference.endsOn,
				status: result.conference.status
			};
		}
	};
}

function updateConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'update_conference',
		description:
			'Change the name, venue or date range of a conference you organize. ' +
			'Changing the dates also rebuilds the agenda days the same way Settings does. ' +
			'The slug cannot be changed. Omit a field to leave it as it is.',
		inputSchema: {
			conferenceSlug: slugField,
			name: z
				.string()
				.min(1)
				.max(120)
				.optional()
				.describe('New name. Omit to keep the current one.'),
			venue: z
				.string()
				.nullable()
				.optional()
				.describe('New venue. Null clears it. Omit to keep it.'),
			startsOn: z
				.string()
				.nullable()
				.optional()
				.describe('New first day, YYYY-MM-DD. Omit to keep the current one.'),
			endsOn: z
				.string()
				.nullable()
				.optional()
				.describe('New last day, YYYY-MM-DD. Omit to keep the current one.')
		},
		handler: async ({ conferenceSlug, name, venue, startsOn, endsOn }) => {
			if (
				name === undefined &&
				venue === undefined &&
				startsOn === undefined &&
				endsOn === undefined
			) {
				throw new McpToolError(
					'Pass at least one of name, venue, startsOn or endsOn. ' + 'The slug cannot be changed.'
				);
			}
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await updateConference(conference.id, { name, venue, startsOn, endsOn });
			if (!result.ok) {
				throw new McpToolError(
					result.reason === 'not_found'
						? `No conference "${conferenceSlug}" that you organize.`
						: result.message
				);
			}
			return {
				slug: result.conference.slug,
				name: result.conference.name,
				venue: result.conference.venue,
				startsOn: result.conference.startsOn,
				endsOn: result.conference.endsOn,
				status: result.conference.status,
				daysAdded: result.days.added,
				daysRemoved: result.days.removed,
				daysKeptInUse: result.days.keptInUse
			};
		}
	};
}

function openCfpTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'open_cfp',
		description:
			'Open the call for papers on a conference you organize. Creates the form if ' +
			'it does not exist yet, then publishes it — the same two actions as the CFP ' +
			'screen. The public form stays 404 until the conference itself is published. ' +
			'Optional opensAt/closesAt set the submission window.',
		inputSchema: {
			conferenceSlug: slugField,
			title: z.string().min(1).optional().describe('Form title. Defaults to "Call for papers".'),
			opensAt: isoInstant.optional(),
			closesAt: isoInstant.optional()
		},
		handler: async ({ conferenceSlug, title, opensAt, closesAt }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			await createCfpForm(conference.id, title ?? `${conference.name} — Call for papers`);
			const window: { title?: string; opensAt?: Date | null; closesAt?: Date | null } = {};
			if (title) window.title = title;
			if (opensAt !== undefined) window.opensAt = parseInstant(opensAt, 'opensAt') ?? null;
			if (closesAt !== undefined) window.closesAt = parseInstant(closesAt, 'closesAt') ?? null;
			const form = await publishCfpForm(conference.id, window);
			if (!form) {
				throw new McpToolError('Could not open the call for papers.');
			}
			return {
				conference: { slug: conference.slug, name: conference.name, status: conference.status },
				form: {
					title: form.title,
					status: form.status,
					opensAt: form.opensAt?.toISOString() ?? null,
					closesAt: form.closesAt?.toISOString() ?? null
				},
				publicCallLive: conference.status === 'published'
			};
		}
	};
}

function closeCfpTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'close_cfp',
		description:
			'Close the call for papers on a conference you organize. Existing submissions ' +
			'stay; no new ones come in. Same action as the CFP screen Close button.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const form = await closeCfpForm(conference.id);
			if (!form) {
				throw new McpToolError(
					`No call for papers on "${conferenceSlug}" yet. Call open_cfp first.`
				);
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				form: { title: form.title, status: form.status }
			};
		}
	};
}

function publishConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'publish_conference',
		description:
			'Publish a conference you organize. /c/<slug> and the public call become live. ' +
			'Same switch as Settings → Publish. Idempotent if it is already published.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await setConferenceVisibility(conference, true);
			return {
				slug: conference.slug,
				status: result.status,
				changed: result.changed,
				publicUrl: `/c/${conference.slug}`
			};
		}
	};
}

function unpublishConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'unpublish_conference',
		description:
			'Return a conference you organize to draft. /c/<slug> and the public call ' +
			'answer 404 again. Same switch as Settings → Return to draft. Idempotent.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await setConferenceVisibility(conference, false);
			return {
				slug: conference.slug,
				status: result.status,
				changed: result.changed
			};
		}
	};
}

function inviteReviewerTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'invite_reviewer',
		description:
			'Add a reviewer to a conference you organize, by email. The address must ' +
			'already have an account — same rule as Team & reviewers when the person ' +
			'is signed up. They can then be passed to assign_reviews.',
		inputSchema: {
			conferenceSlug: slugField,
			email: z.string().min(1).describe('Reviewer email. They must already have an account.')
		},
		handler: async ({ conferenceSlug, email }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await addReviewer(conference.id, email);
			if (!result.ok) {
				throw new McpToolError(result.message);
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				reviewer: { name: result.name, email: email.trim() },
				added: true
			};
		}
	};
}

function assignReviewsTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'assign_reviews',
		description:
			'Assign one reviewer to one or more submissions of a conference you organize. ' +
			'Same function as the submissions-table bulk assign: existing assignments stay, ' +
			'recusals stay recused, ineligible pairs are counted as skipped. Identify the ' +
			"reviewer by the email you invited. Omit roundId to use the conference's first round.",
		inputSchema: {
			conferenceSlug: slugField,
			submissionIds: z
				.array(z.number().int())
				.min(1)
				.max(100)
				.describe('Submission ids from list_submissions (1-100).'),
			reviewerEmail: z.string().min(1).describe('Email of a reviewer already on the committee.'),
			roundId: z
				.number()
				.int()
				.optional()
				.describe('Review round id. Omit to use the first round on the conference.')
		},
		handler: async ({ conferenceSlug, submissionIds, reviewerEmail, roundId }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const [reviewer] = await db
				.select({ id: user.id, email: user.email, name: user.name })
				.from(user)
				.where(eq(user.email, reviewerEmail.trim()))
				.limit(1);
			if (!reviewer) {
				throw new McpToolError(
					`No account for ${reviewerEmail.trim()}. Invite them with invite_reviewer first.`
				);
			}

			const rounds = await reviewRounds(conference.id);
			const round = roundId === undefined ? rounds[0] : rounds.find((row) => row.id === roundId);
			if (!round) {
				throw new McpToolError(
					roundId === undefined
						? `No review round on "${conferenceSlug}" yet. Create one on the Review rounds screen, then retry.`
						: `No review round ${roundId} on "${conferenceSlug}".`
				);
			}

			const assigned = await assignReviewerToSubmissions(
				conference.id,
				submissionIds,
				round.id,
				reviewer.id
			);

			return {
				conference: { slug: conference.slug, name: conference.name },
				round: { id: round.id, name: round.name },
				reviewer: { email: reviewer.email, name: reviewer.name },
				requested: submissionIds.length,
				...assigned
			};
		}
	};
}

export function conferenceWriteTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [
		createConferenceTool(ctx),
		updateConferenceTool(ctx),
		openCfpTool(ctx),
		closeCfpTool(ctx),
		publishConferenceTool(ctx),
		unpublishConferenceTool(ctx),
		inviteReviewerTool(ctx),
		assignReviewsTool(ctx)
	];
}
