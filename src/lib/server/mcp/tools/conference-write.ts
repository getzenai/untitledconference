/**
 * Organizer write tools (#298). Each one calls the same function the screen
 * calls — never a column. Definitions live in an exported list so the MCP
 * adapter (and later REST) is a loop, not a second implementation.
 */
import { MAX_MINUTES, MAX_NAME } from '$lib/conference/structure-lines';
import { closeCfpForm, createCfpForm, publishCfpForm } from '$lib/server/conference/cfp-form';
import { addFormat, addTrack, conferenceConfig } from '$lib/server/conference/config';
import { createConference } from '$lib/server/conference/create-conference';
import { assignReviewerToSubmissions } from '$lib/server/conference/review-management';
import { addReviewRound, reviewRounds } from '$lib/server/conference/review-rounds';
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
			'reviewer by the email you invited. A conference needs a review round first — ' +
			'call create_review_round if list_review_rounds is empty. ' +
			"Omit roundId to use the conference's first round.",
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
						? `No review round on "${conferenceSlug}" yet. Call create_review_round, then retry.`
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

function listReviewRoundsTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_review_rounds',
		description:
			'List the review rounds of a conference you organize, in order. ' +
			'A fresh conference has none — call create_review_round before assign_reviews. ' +
			'Use the ids with assign_reviews.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const rounds = await reviewRounds(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				count: rounds.length,
				rounds: rounds.map((round) => ({
					id: round.id,
					name: round.name,
					anonymized: round.anonymized,
					opensAt: round.opensAt?.toISOString() ?? null,
					closesAt: round.closesAt?.toISOString() ?? null,
					window: round.window.state,
					assignments: round.assignments,
					completed: round.completed
				}))
			};
		}
	};
}

function createReviewRoundTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_review_round',
		description:
			'Add a review round to a conference you organize. Same function as the ' +
			'Review rounds screen (`addReviewRound`). Creates the conference evaluation ' +
			'plan on the first round. Does not assign anyone — call invite_reviewer, then ' +
			'assign_reviews with the id this returns. Omit the dates for a round that ' +
			'stays open until you close it.',
		inputSchema: {
			conferenceSlug: slugField,
			name: z.string().min(1).max(MAX_NAME).describe('Round name, e.g. Screening.'),
			opensAt: isoInstant.optional(),
			closesAt: isoInstant.optional(),
			anonymized: z
				.boolean()
				.optional()
				.describe('Hide author names from reviewers. Default false.')
		},
		handler: async ({ conferenceSlug, name, opensAt, closesAt, anonymized }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await addReviewRound(conference.id, {
				name,
				anonymized: anonymized ?? false,
				opensAt: parseInstant(opensAt, 'opensAt') ?? null,
				closesAt: parseInstant(closesAt, 'closesAt') ?? null
			});
			if (!result.ok) {
				throw new McpToolError(result.message);
			}
			const rounds = await reviewRounds(conference.id);
			const round = rounds.find((row) => row.id === result.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				round: {
					id: result.id,
					name: round?.name ?? name.trim(),
					anonymized: round?.anonymized ?? anonymized ?? false,
					opensAt: round?.opensAt?.toISOString() ?? null,
					closesAt: round?.closesAt?.toISOString() ?? null,
					window: round?.window.state ?? 'open'
				}
			};
		}
	};
}

function listSessionFormatsTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_session_formats',
		description:
			'List the session formats of a conference you organize (Talk, Keynote, …). ' +
			'`minutes` is the default length place_talk uses. A fresh conference has none — ' +
			'call create_session_format so submit_proposal can take a sessionFormatId.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const { formats } = await conferenceConfig(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				count: formats.length,
				formats: formats.map((format) => ({
					id: format.id,
					name: format.name,
					minutes: format.minutes,
					position: format.position
				}))
			};
		}
	};
}

function createSessionFormatTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_session_format',
		description:
			'Add one session format to a conference you organize. Same function as ' +
			'Settings → Formats (`addFormat`). `minutes` becomes the default length of ' +
			'an accepted talk of this format. A duplicate name is refused.',
		inputSchema: {
			conferenceSlug: slugField,
			name: z.string().min(1).max(MAX_NAME).describe('Format name, e.g. Talk.'),
			minutes: z
				.number()
				.int()
				.min(1)
				.max(MAX_MINUTES)
				.optional()
				.describe('Length in minutes (1–1440). Omit if the format has no fixed length.')
		},
		handler: async ({ conferenceSlug, name, minutes }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const trimmed = name.trim();
			if (!trimmed) {
				throw new McpToolError('Give the format a name.');
			}
			const before = await conferenceConfig(conference.id);
			const existing = before.formats.find(
				(format) => format.name.toLowerCase() === trimmed.toLowerCase()
			);
			if (existing) {
				throw new McpToolError(`A format named "${existing.name}" already exists.`);
			}
			const id = await addFormat(conference.id, trimmed, minutes ?? null);
			if (id === null) {
				throw new McpToolError('Could not create the format. Check the name and minutes.');
			}
			const after = await conferenceConfig(conference.id);
			const format = after.formats.find((row) => row.id === id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				format: {
					id,
					name: format?.name ?? trimmed,
					minutes: format?.minutes ?? minutes ?? null,
					position: format?.position ?? null
				}
			};
		}
	};
}

function listTracksTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_tracks',
		description:
			'List the tracks of a conference you organize, in order. A fresh conference ' +
			'has none — call create_track so submit_proposal can take a trackId.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const { tracks } = await conferenceConfig(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				count: tracks.length,
				tracks: tracks.map((track) => ({
					id: track.id,
					name: track.name,
					position: track.position
				}))
			};
		}
	};
}

function createTrackTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_track',
		description:
			'Add one track to a conference you organize. Same function as Settings → ' +
			'Tracks (`addTrack`). A duplicate name is refused.',
		inputSchema: {
			conferenceSlug: slugField,
			name: z.string().min(1).max(MAX_NAME).describe('Track name, e.g. Platform.')
		},
		handler: async ({ conferenceSlug, name }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const trimmed = name.trim();
			if (!trimmed) {
				throw new McpToolError('Give the track a name.');
			}
			const before = await conferenceConfig(conference.id);
			const existing = before.tracks.find(
				(track) => track.name.toLowerCase() === trimmed.toLowerCase()
			);
			if (existing) {
				throw new McpToolError(`A track named "${existing.name}" already exists.`);
			}
			const id = await addTrack(conference.id, trimmed);
			if (id === null) {
				throw new McpToolError('Could not create the track.');
			}
			const after = await conferenceConfig(conference.id);
			const track = after.tracks.find((row) => row.id === id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				track: { id, name: track?.name ?? trimmed, position: track?.position ?? null }
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
		listReviewRoundsTool(ctx),
		createReviewRoundTool(ctx),
		assignReviewsTool(ctx),
		listSessionFormatsTool(ctx),
		createSessionFormatTool(ctx),
		listTracksTool(ctx),
		createTrackTool(ctx)
	];
}
