/**
 * Organizer write tools (#298). Each one calls the same function the screen
 * calls — never a column. Definitions live in an exported list so the MCP
 * adapter (and later REST) is a loop, not a second implementation.
 */
import {
	MAX_MINUTES,
	MAX_NAME,
	parseFormatLines,
	parseNames
} from '$lib/conference/structure-lines';
import { archiveConference, restoreConference } from '$lib/server/conference/archive-conference';
import { closeCfpForm, createCfpForm, publishCfpForm } from '$lib/server/conference/cfp-form';
import { addFormat, addTrack, conferenceConfig } from '$lib/server/conference/config';
import { createConference } from '$lib/server/conference/create-conference';
import { notifySubmissionDecisions } from '$lib/server/conference/decision-notifications';
import { deleteConference } from '$lib/server/conference/delete-conference';
import { assignReviewerToSubmissions } from '$lib/server/conference/review-management';
import { addReviewRound, reviewRounds } from '$lib/server/conference/review-rounds';
import {
	addReviewer,
	committee,
	pendingReviewerInvitations,
	removeReviewer
} from '$lib/server/conference/reviewer-roster';
import { updateConference } from '$lib/server/conference/update-conference';
import { setConferenceVisibility } from '$lib/server/conference/visibility';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { organizerConference } from '../organizer';
import { McpToolError, type AnyMcpToolDefinition } from '../tool-helpers';

const slugField = z
	.string()
	.min(1)
	.describe('Conference slug, from list_my_conferences or create_conference.');

const isoInstant = z.string().min(1).describe('ISO-8601 instant (e.g. 2027-10-01T09:00:00.000Z).');

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
			if (result.status === 'archived') {
				throw new McpToolError(
					`"${conferenceSlug}" is archived. Call restore_conference first — publishing is not ` +
						'a way out of the archive. Nothing was published.'
				);
			}
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
			if (result.status === 'archived') {
				throw new McpToolError(
					`"${conferenceSlug}" is archived, which is further down than draft. Call ` +
						'restore_conference to bring it back. Nothing changed.'
				);
			}
			return {
				slug: conference.slug,
				status: result.status,
				changed: result.changed
			};
		}
	};
}

/**
 * The confirmation slug, checked before anything is resolved.
 *
 * A mismatch is the caller contradicting itself, and that is worth stopping on
 * whatever the slug happens to name.
 */
function requireConfirmation(conferenceSlug: string, confirmSlug: string, verb: string): void {
	if (confirmSlug !== conferenceSlug) {
		throw new McpToolError(
			`confirmSlug "${confirmSlug}" does not match conferenceSlug "${conferenceSlug}". ` +
				`Nothing was ${verb}. Pass the same slug twice to confirm.`
		);
	}
}

const confirmSlugField = z
	.string()
	.optional()
	.describe('The same slug again. Required for a published conference; ignored for a draft.');

function archiveConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'archive_conference',
		description:
			'Archive a conference in an organization you own or administer. This is how a ' +
			'conference is removed: /c/<slug>, the public call for papers, the front-door ' +
			'directory and the speaker pages all stop showing it, while every room, ' +
			'submission, review and placement is kept. restore_conference undoes it exactly. ' +
			'Needs an org-wide owner or admin seat — being an organizer on the event is not ' +
			'enough. If the conference is currently published, repeat the slug in confirmSlug: ' +
			'a public address stops being served the moment this returns, though a page already ' +
			'cached at the edge can still be handed out for up to a minute after.',
		inputSchema: { conferenceSlug: slugField, confirmSlug: confirmSlugField },
		handler: async ({ conferenceSlug, confirmSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);

			// Graded by what the step costs, so the confirmation is asked for only where
			// it means something. Demanded on every archive, it would become the noise a
			// caller learns to type without reading — and then it guards nothing on the
			// one call where it mattered.
			if (conference.status === 'published') {
				if (confirmSlug === undefined) {
					throw new McpToolError(
						`"${conferenceSlug}" is published, so archiving it takes /c/${conferenceSlug} ` +
							'offline for everyone holding the link. Pass confirmSlug with the same slug ' +
							'to confirm. Nothing was archived.'
					);
				}
				requireConfirmation(conferenceSlug, confirmSlug, 'archived');
			}

			const result = await archiveConference(conference, ctx.userId);
			if (!result.ok) {
				throw new McpToolError(
					result.reason === 'not_org_wide'
						? `Archiving "${conferenceSlug}" needs an owner or admin seat in its organization. ` +
								'Organizing this one event is not enough. Nothing was archived.'
						: `"${conferenceSlug}" is already archived. Nothing changed.`
				);
			}
			return {
				slug: conference.slug,
				name: conference.name,
				status: 'archived',
				/** True when a live public page was taken down, not merely a draft hidden. */
				wentDark: result.wasPublic,
				restoreWith: 'restore_conference'
			};
		}
	};
}

function restoreConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'restore_conference',
		description:
			'Bring an archived conference back, exactly where it was: published if it was ' +
			'published, a draft if it was a draft. Everything under it was kept, so nothing ' +
			'has to be rebuilt. Needs an org-wide owner or admin seat.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await restoreConference(conference, ctx.userId);
			if (!result.ok) {
				throw new McpToolError(
					result.reason === 'not_org_wide'
						? `Restoring "${conferenceSlug}" needs an owner or admin seat in its organization. ` +
								'Organizing this one event is not enough. Nothing changed.'
						: `"${conferenceSlug}" is ${conference.status}, not archived. Nothing to restore.`
				);
			}
			return {
				slug: conference.slug,
				name: conference.name,
				status: result.status,
				publicUrl: result.status === 'published' ? `/c/${conference.slug}` : null
			};
		}
	};
}

function deleteConferenceTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'delete_conference',
		description:
			'Erase an archived conference and everything under it — rooms, tracks, days, the ' +
			'call for papers and its submissions, reviews and agenda. There is no undo. Two ' +
			'conditions beyond the org-wide owner or admin seat: the conference must already ' +
			'be archived (call archive_conference first, so the step can be seen and reversed ' +
			'before it becomes permanent), and it must never have been published — a ' +
			'conference that once had a public address can be archived but not erased. ' +
			'Repeat the slug in confirmSlug. Two things are kept on purpose: speaker profiles, ' +
			'which are org-wide, and files that were uploaded to tasks — the records pointing ' +
			'at them go, the stored files themselves are not reachable from here.',
		inputSchema: {
			conferenceSlug: slugField,
			confirmSlug: z
				.string()
				.min(1)
				.describe('The same slug again. Must match conferenceSlug exactly.')
		},
		handler: async ({ conferenceSlug, confirmSlug }) => {
			requireConfirmation(conferenceSlug, confirmSlug, 'deleted');

			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await deleteConference(conference, ctx.userId);
			if (!result.ok) {
				throw new McpToolError(deleteRefusal(conferenceSlug, conference.status, result.reason));
			}
			return {
				slug: conference.slug,
				name: conference.name,
				deleted: true,
				removed: result.removed
			};
		}
	};
}

/**
 * Why the erase refused, in the caller's terms.
 *
 * `not_archived` arrives in two different situations and they need different
 * sentences: a conference that was never archived needs to be told about
 * `archive_conference`, while one that was archived a moment ago and is not any
 * more lost a race with a restore — and telling that caller to archive again
 * would be telling it to undo somebody's deliberate act.
 */
function deleteRefusal(
	slug: string,
	statusWhenRead: string,
	reason: 'not_org_wide' | 'not_archived' | 'was_published'
): string {
	if (reason === 'not_org_wide') {
		return (
			`Deleting "${slug}" needs an owner or admin seat in its organization. ` +
			'Organizing this one event is not enough. Nothing was deleted.'
		);
	}
	if (reason === 'was_published') {
		return (
			`"${slug}" was published before it was archived, and a conference that once had a ` +
			'public address is not erased. It stays archived, which already hides it everywhere. ' +
			'Nothing was deleted.'
		);
	}
	if (statusWhenRead === 'archived') {
		return (
			`"${slug}" was restored while this call was in flight, and only an archived ` +
			'conference can be deleted. Nothing was deleted.'
		);
	}
	return (
		`"${slug}" is ${statusWhenRead}, not archived. Call archive_conference first — ` +
		'archiving is the step that can be undone, and deleting is the one that cannot. ' +
		'Nothing was deleted.'
	);
}

function inviteReviewerTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'invite_reviewer',
		description:
			'Add a reviewer to a conference you organize, by email. The address must ' +
			'already have an account — same rule as Team & reviewers when the person ' +
			'is signed up. They can then be passed to assign_reviews. Call list_reviewers ' +
			'to see who is already on the committee.',
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
			'recusals stay recused, ineligible pairs are listed in skipped with a reason ' +
			'(speaker_conflict, not_on_conference, not_in_round, track_restricted). ' +
			'not_in_round is a seat on another round of this conference, not a missing ' +
			'committee seat — list_reviewers still shows them. ' +
			'Identify the reviewer by an email from list_reviewers. A conference needs a ' +
			'review round first — call create_review_round if list_review_rounds is empty. ' +
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

			const members = await committee(conference.id);
			if (!members.some((member) => member.userId === reviewer.id)) {
				throw new McpToolError(
					`${reviewer.email} is not on the committee of "${conferenceSlug}". ` +
						'Call list_reviewers to see who is, or invite_reviewer to add them.'
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
				created: assigned.created,
				already: assigned.already,
				recused: assigned.recused,
				skippedCount: assigned.skipped,
				skipped: assigned.skippedItems
			};
		}
	};
}

async function recusalCounts(
	conferenceId: number,
	userIds: string[]
): Promise<Map<string, number>> {
	if (userIds.length === 0) return new Map();
	const rows = await db
		.select({
			userId: reviewTable.reviewerUserId,
			recused: count()
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				inArray(reviewTable.reviewerUserId, userIds),
				eq(reviewTable.status, 'recused')
			)
		)
		.groupBy(reviewTable.reviewerUserId);
	return new Map(rows.map((row) => [row.userId, Number(row.recused)]));
}

function listReviewersTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_reviewers',
		description:
			'List the review committee of a conference you organize — the same people ' +
			'Team & reviewers shows. Returns email, name, role, assignment counts and ' +
			'recusals. Use the emails with assign_reviews. A conference with nobody ' +
			'here cannot be assigned.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const members = await committee(conference.id);
			const [pending, recused] = await Promise.all([
				pendingReviewerInvitations(conference.id),
				recusalCounts(
					conference.id,
					members.map((member) => member.userId)
				)
			]);
			return {
				conference: { slug: conference.slug, name: conference.name },
				count: members.length,
				reviewers: members.map((member) => ({
					email: member.email,
					name: member.name,
					role: member.conferenceManaged ? 'conference' : 'round',
					rounds: member.rounds,
					assigned: member.assigned,
					submitted: member.submitted,
					outstanding: member.outstanding,
					recused: recused.get(member.userId) ?? 0,
					tracks: member.tracks
				})),
				pending: pending.map((invite) => ({
					email: invite.email,
					expiresAt: invite.expiresAt.toISOString()
				}))
			};
		}
	};
}

function removeReviewerTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'remove_reviewer',
		description:
			'Take a reviewer off the committee of a conference you organize, by email. ' +
			'Same action as Team & reviewers → Remove. Existing reviews stay; they just ' +
			'cannot be assigned more. Round-scoped seats are not removed this way — the ' +
			'screen cannot remove those either.',
		inputSchema: {
			conferenceSlug: slugField,
			email: z.string().min(1).describe('Email of a committee member from list_reviewers.')
		},
		handler: async ({ conferenceSlug, email }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const wanted = email.trim().toLowerCase();
			const member = (await committee(conference.id)).find(
				(row) => row.email.toLowerCase() === wanted
			);
			if (!member) {
				throw new McpToolError(
					`Nobody on the committee of "${conferenceSlug}" has the address ${email.trim()}. ` +
						'Call list_reviewers.'
				);
			}
			if (!member.conferenceManaged) {
				throw new McpToolError(
					`${member.name} is a round-scoped reviewer, not a conference seat. ` +
						'The Team screen cannot remove those either. Nothing changed.'
				);
			}
			const result = await removeReviewer(conference.id, member.membershipId);
			if (!result.ok) {
				throw new McpToolError(`Could not remove ${member.email} from the committee.`);
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				reviewer: { email: member.email, name: member.name },
				removed: true
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

/** Same collapse `addFormat` applies before it stores the line. */
function oneLine(name: string): string {
	return name.replace(/\n/g, ' ').trim().slice(0, MAX_NAME);
}

/**
 * The name (and minutes) `addFormat` will actually store.
 *
 * The writer round-trips the line through `parseFormatLines`, so `Talk, 30`
 * becomes a format called Talk with 30 minutes. The pre-check has to use the
 * same name or it looks for a format that will never exist and then reports
 * the null path as "invalid input".
 */
function parseCreatedFormat(
	name: string,
	minutes: number | undefined
): { name: string; minutes: number | null } {
	const line = minutes === undefined ? oneLine(name) : `${oneLine(name)}, ${minutes}`;
	const parsed = parseFormatLines(line);
	if (!parsed.ok) {
		throw new McpToolError(parsed.problem);
	}
	const wanted = parsed.formats[0];
	if (!wanted) {
		throw new McpToolError('Give the format a name.');
	}
	return wanted;
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
			const wanted = parseCreatedFormat(name, minutes);
			const before = await conferenceConfig(conference.id);
			const existing = before.formats.find(
				(format) => format.name.toLowerCase() === wanted.name.toLowerCase()
			);
			if (existing) {
				throw new McpToolError(`A format named "${existing.name}" already exists.`);
			}
			const id = await addFormat(conference.id, wanted.name, wanted.minutes);
			if (id === null) {
				const after = await conferenceConfig(conference.id);
				const raced = after.formats.find(
					(format) => format.name.toLowerCase() === wanted.name.toLowerCase()
				);
				throw new McpToolError(
					raced
						? `A format named "${raced.name}" already exists.`
						: 'Could not create the format. Check the name and minutes.'
				);
			}
			const after = await conferenceConfig(conference.id);
			const format = after.formats.find((row) => row.id === id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				format: {
					id,
					name: format?.name ?? wanted.name,
					minutes: format?.minutes ?? wanted.minutes,
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
			const [wanted] = parseNames(name);
			if (!wanted) {
				throw new McpToolError('Give the track a name.');
			}
			const before = await conferenceConfig(conference.id);
			const existing = before.tracks.find(
				(track) => track.name.toLowerCase() === wanted.toLowerCase()
			);
			if (existing) {
				throw new McpToolError(`A track named "${existing.name}" already exists.`);
			}
			const id = await addTrack(conference.id, wanted);
			if (id === null) {
				const after = await conferenceConfig(conference.id);
				const raced = after.tracks.find(
					(track) => track.name.toLowerCase() === wanted.toLowerCase()
				);
				throw new McpToolError(
					raced ? `A track named "${raced.name}" already exists.` : 'Could not create the track.'
				);
			}
			const after = await conferenceConfig(conference.id);
			const track = after.tracks.find((row) => row.id === id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				track: { id, name: track?.name ?? wanted, position: track?.position ?? null }
			};
		}
	};
}

function notifySpeakersTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'notify_speakers',
		description:
			'Tell speakers the current decision on one or more proposals of a conference you organize. ' +
			'Same path as the Notify button on the submissions table — not a second send. ' +
			'A proposal with no decision is counted under notDecided and is not emailed. ' +
			'A second call for the same decision reports alreadyNotified and sends nothing. ' +
			'Call decide_submissions first.',
		inputSchema: {
			conferenceSlug: slugField,
			submissionIds: z
				.array(z.number().int())
				.min(1)
				.max(100)
				.describe('Submission ids to notify, from list_submissions (1-100).')
		},
		handler: async ({ conferenceSlug, submissionIds }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			// `notifySubmissionDecisions` is the Notify button. Reusing it is the
			// point: a second send path would drift from the table, and deciding
			// already refuses to mail anyone.
			const result = await notifySubmissionDecisions(conference, submissionIds);
			return {
				conference: { slug: conference.slug, name: conference.name },
				requested: submissionIds.length,
				...result
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
		archiveConferenceTool(ctx),
		restoreConferenceTool(ctx),
		deleteConferenceTool(ctx),
		inviteReviewerTool(ctx),
		listReviewersTool(ctx),
		removeReviewerTool(ctx),
		listReviewRoundsTool(ctx),
		createReviewRoundTool(ctx),
		assignReviewsTool(ctx),
		listSessionFormatsTool(ctx),
		createSessionFormatTool(ctx),
		listTracksTool(ctx),
		createTrackTool(ctx),
		notifySpeakersTool(ctx)
	];
}
