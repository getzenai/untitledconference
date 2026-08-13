/**
 * Organizer write tools (#298). Each one calls the same function the screen
 * calls — never a column. Definitions live in an exported list so the MCP
 * adapter (and later REST) is a loop, not a second implementation.
 */
import { archiveConference, restoreConference } from '$lib/server/conference/archive-conference';
import { closeCfpForm, createCfpForm, publishCfpForm } from '$lib/server/conference/cfp-form';
import { createConference } from '$lib/server/conference/create-conference';
import { deleteConference } from '$lib/server/conference/delete-conference';
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
		archiveConferenceTool(ctx),
		restoreConferenceTool(ctx),
		deleteConferenceTool(ctx),
		inviteReviewerTool(ctx),
		assignReviewsTool(ctx)
	];
}
