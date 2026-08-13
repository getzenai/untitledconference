/**
 * Speaker and reviewer tools (#299). Each one calls the same function the
 * screen calls — a reviewer never sees through MCP what the queue would hide.
 */
import { isPublishableUrl, parseSpeakerLinks } from '$lib/conference/speaker-links';
import {
	guessSortName,
	listOpenCalls,
	ownedSubmission,
	saveSubmission,
	withdrawSubmission,
	type CoSpeakerInput,
	type SubmissionInput
} from '$lib/server/conference/cfp-submission';
import {
	requireReviewer,
	reviewedConferences,
	reviewerSubmission,
	reviewQueue,
	saveReview
} from '$lib/server/conference/reviewer';
import { editableDraft, mySubmissions } from '$lib/server/conference/speaker-portal';
import {
	ensureProfileForConference,
	myProfiles,
	setOwnHeadshot,
	updateOwnProfile
} from '$lib/server/conference/speaker-profile';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { McpToolError, type AnyMcpToolDefinition } from '../tool-helpers';

const slugField = z.string().min(1).describe('Conference slug.');

const coSpeakerSchema = z.object({
	name: z.string().min(1).describe('Co-speaker name.'),
	email: z.string().nullable().optional().describe('Co-speaker email, if known.'),
	roleLabel: z.string().nullable().optional().describe('Role on the talk, if any.')
});

async function account(userId: string) {
	const [row] = await db
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row) throw new McpToolError('Your user account no longer exists.');
	return row;
}

/**
 * `requireReviewer` throws a SvelteKit 404 — right for a route, wrong for a
 * tool. Same collapse as `organizerConference`: missing and not-yours are one
 * refusal, so the agent cannot learn which slugs exist elsewhere.
 */
async function reviewerConference(slug: string, ctx: McpContext) {
	try {
		return await requireReviewer(ctx.userId, slug);
	} catch {
		throw new McpToolError(
			`No conference "${slug}" that you review for. ` +
				'Call list_my_review_assignments to see the ones you can reach.'
		);
	}
}

function saveFailure(result: Awaited<ReturnType<typeof saveSubmission>>): never {
	if (result.ok) throw new Error('saveFailure called on success');
	if (result.reason === 'not_found') {
		throw new McpToolError('No open call at that slug. Call list_open_cfps.');
	}
	if (result.reason === 'closed') {
		throw new McpToolError('That call is not accepting submissions or edits right now.');
	}
	if (result.reason === 'forbidden') {
		throw new McpToolError(
			'That proposal is not yours to change, or a decision has already been made.'
		);
	}
	if (result.reason !== 'invalid') {
		throw new Error(
			`saveFailure: unhandled reason ${String((result as { reason: string }).reason)}`
		);
	}
	const bits = [...Object.values(result.errors), ...Object.values(result.fieldErrors)].filter(
		Boolean
	);
	throw new McpToolError(bits.join(' ') || 'The proposal is not valid.');
}

function asCoSpeakers(
	rows: { name: string; email?: string | null; roleLabel?: string | null }[]
): CoSpeakerInput[] {
	return rows.map((co) => ({
		name: co.name,
		email: co.email ?? null,
		roleLabel: co.roleLabel ?? null
	}));
}

async function speakerInput(ctx: McpContext): Promise<SubmissionInput['speaker']> {
	const me = await account(ctx.userId);
	const profiles = await myProfiles(ctx.userId);
	const profile = profiles[0];
	const name = profile?.name || me.name || 'Speaker';
	return {
		name,
		sortName: profile?.sortName || guessSortName(name),
		email: me.email,
		jobTitle: profile?.jobTitle ?? null,
		company: profile?.company ?? null,
		bio: profile?.bio ?? null
	};
}

function listOpenCfps(): AnyMcpToolDefinition {
	return {
		name: 'list_open_cfps',
		description:
			'List published conferences whose call for papers is currently open. ' +
			'These are the slugs submit_proposal accepts. A draft conference or a ' +
			'closed call does not appear — the public site would not offer them either.',
		inputSchema: {},
		handler: async () => {
			const calls = await listOpenCalls();
			return { count: calls.length, calls };
		}
	};
}

function submitProposal(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'submit_proposal',
		description:
			'Create a draft proposal on an open call. You become the speaker. A draft needs only a title. ' +
			'It is NOT handed in yet — call finalize_proposal when it is ready, which is ' +
			'when the abstract (if this call asks for one) and any required custom answers ' +
			'have to be there. Format, track and co-speakers stay optional throughout. ' +
			'Identity comes from the access token.',
		inputSchema: {
			conferenceSlug: slugField.describe('From list_open_cfps.'),
			title: z.string().min(1).describe('Talk title.'),
			abstract: z.string().optional().describe('Abstract.'),
			keyTakeaway: z.string().optional(),
			audienceLevel: z.string().optional(),
			sessionFormatId: z.number().int().optional().describe('Format id from list_open_cfps.'),
			trackId: z.number().int().optional().describe('Track id from list_open_cfps.'),
			coSpeakers: z.array(coSpeakerSchema).optional()
		},
		handler: async (args) => {
			const result = await saveSubmission(
				ctx.userId,
				args.conferenceSlug,
				{
					title: args.title,
					abstract: args.abstract ?? null,
					keyTakeaway: args.keyTakeaway ?? null,
					audienceLevel: args.audienceLevel ?? null,
					sessionFormatId: args.sessionFormatId ?? null,
					trackId: args.trackId ?? null,
					answers: {},
					speaker: await speakerInput(ctx),
					coSpeakers: asCoSpeakers(args.coSpeakers ?? [])
				},
				{ submit: false }
			);
			if (!result.ok) saveFailure(result);
			// `next` repeats in the payload what the description already says, because
			// the two are read at different moments: the description is read when the
			// agent chooses a tool, `next` when it looks at what came back. A caller
			// that picked this tool for its name alone sees `draft` and would otherwise
			// have no reason to look further (#335).
			return {
				submissionId: result.submissionId,
				status: result.status,
				conferenceSlug: args.conferenceSlug,
				next: 'finalize_proposal'
			};
		}
	};
}

function updateProposal(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'update_proposal',
		description:
			'Edit one of your proposals while the call is still open and no decision ' +
			'has been made. Same function as the CFP form (`saveSubmission`). Omit a ' +
			'field to leave it as it is — answers and co-speakers you do not send stay.',
		inputSchema: {
			conferenceSlug: slugField,
			submissionId: z.number().int().describe('From list_my_proposals.'),
			title: z.string().min(1).optional(),
			abstract: z.string().nullable().optional(),
			keyTakeaway: z.string().nullable().optional(),
			audienceLevel: z.string().nullable().optional(),
			sessionFormatId: z.number().int().nullable().optional(),
			trackId: z.number().int().nullable().optional(),
			coSpeakers: z.array(coSpeakerSchema).optional()
		},
		handler: async (args) => {
			const existing = await editableDraft(ctx.userId, args.submissionId);
			if (!existing || existing.conferenceSlug !== args.conferenceSlug) {
				throw new McpToolError(
					'That proposal is not yours to change, or a decision has already been made.'
				);
			}
			const draft = existing.draft;
			const coSpeakers = asCoSpeakers(args.coSpeakers ?? draft.coSpeakers);
			const result = await saveSubmission(
				ctx.userId,
				args.conferenceSlug,
				{
					title: args.title ?? draft.title,
					abstract: args.abstract !== undefined ? args.abstract : draft.abstract || null,
					keyTakeaway:
						args.keyTakeaway !== undefined ? args.keyTakeaway : draft.keyTakeaway || null,
					audienceLevel:
						args.audienceLevel !== undefined ? args.audienceLevel : draft.audienceLevel || null,
					sessionFormatId:
						args.sessionFormatId !== undefined ? args.sessionFormatId : draft.sessionFormatId,
					trackId: args.trackId !== undefined ? args.trackId : draft.trackId,
					answers: draft.answers,
					speaker: {
						name: draft.speaker.name,
						sortName: draft.speaker.sortName,
						email: draft.speaker.email,
						jobTitle: draft.speaker.jobTitle || null,
						company: draft.speaker.company || null,
						bio: draft.speaker.bio || null
					},
					coSpeakers
				},
				// A draft stays a draft; an already-filed proposal keeps its standing.
				{ submit: existing.status !== 'draft', submissionId: args.submissionId }
			);
			if (!result.ok) saveFailure(result);
			return { submissionId: result.submissionId, status: result.status };
		}
	};
}

/**
 * The submit button, as a tool.
 *
 * It is a tool of its own rather than a `submit: true` flag on the two writing
 * tools, and that is the whole point of the fix: a model reads `tools/list`, so
 * a transition that lives in a boolean inside an input schema is one it can miss
 * — which is exactly how an agent-driven speaker journey dead-ended with a
 * proposal the organizer could see and nobody had handed in.
 *
 * The slug is taken from the draft rather than from an argument. `saveSubmission`
 * resolves the call by slug and would rewrite `conferenceId`/`cfpFormId` on a
 * mismatch, so accepting one here would be a way to move a proposal between
 * conferences; reading it from the row makes that unrepresentable instead of
 * merely checked.
 */
function finalizeProposal(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'finalize_proposal',
		description:
			'Hand in one of your drafts — the same transition as the submit button on the ' +
			'CFP form. Nothing you wrote changes; only the status does. What has to be ' +
			'filled in by now: the title, your name and email, the abstract if this call ' +
			'asks for one, and every form field the call marks required. Format, track and ' +
			'co-speakers never become required. Calling it on a proposal that is already in ' +
			'changes nothing and sends no second confirmation. While the call is open you ' +
			'can still edit with update_proposal.',
		inputSchema: {
			submissionId: z.number().int().describe('From list_my_proposals.')
		},
		handler: async ({ submissionId }) => {
			const existing = await editableDraft(ctx.userId, submissionId);
			if (!existing) {
				throw new McpToolError(
					`No proposal ${submissionId} that is yours to hand in, or a decision has already been made.`
				);
			}

			const draft = existing.draft;
			const result = await saveSubmission(
				ctx.userId,
				existing.conferenceSlug,
				{
					title: draft.title,
					abstract: draft.abstract || null,
					keyTakeaway: draft.keyTakeaway || null,
					audienceLevel: draft.audienceLevel || null,
					sessionFormatId: draft.sessionFormatId,
					trackId: draft.trackId,
					answers: draft.answers,
					speaker: {
						name: draft.speaker.name,
						sortName: draft.speaker.sortName,
						email: draft.speaker.email,
						jobTitle: draft.speaker.jobTitle || null,
						company: draft.speaker.company || null,
						bio: draft.speaker.bio || null
					},
					coSpeakers: asCoSpeakers(draft.coSpeakers)
				},
				{ submit: true, submissionId }
			);
			// A rejection here names the fields that are still missing — every
			// message from `validateForSubmit` and `validateAnswers` carries its own
			// label — so the agent learns what to fix rather than that it failed.
			if (!result.ok) saveFailure(result);

			// Read the status back off the row instead of trusting `result.status`,
			// which `saveSubmission` derives from the *intent* (`submit ? 'submitted'
			// : 'draft'`) and not from what is stored. A proposal a reviewer has
			// already picked up is `in_review`, and `submissionValues` correctly
			// leaves it there — so the derived answer would contradict the database
			// and `list_my_proposals` (#331).
			// 'speaker' and not 'primary': a co-presenter is allowed to hand the
			// proposal in, and asking as the primary would answer `null` for them —
			// dropping the status straight back onto the derived value this read
			// exists to replace (#330).
			const stored = await ownedSubmission(ctx.userId, submissionId, 'speaker');

			return {
				submissionId: result.submissionId,
				status: stored?.status ?? result.status,
				conferenceSlug: existing.conferenceSlug
			};
		}
	};
}

function withdrawProposal(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'withdraw_proposal',
		description:
			'Withdraw one of your proposals. Only drafts, submitted and in-review ' +
			'proposals can be withdrawn — a decision has already been read and those ' +
			'words stay.',
		inputSchema: {
			submissionId: z.number().int().describe('From list_my_proposals.')
		},
		handler: async ({ submissionId }) => {
			const result = await withdrawSubmission(ctx.userId, submissionId);
			if (!result.ok) {
				throw new McpToolError(
					result.reason === 'not_found'
						? `No proposal ${submissionId} that is yours.`
						: 'That proposal already has a decision and cannot be withdrawn.'
				);
			}
			return { submissionId, status: 'withdrawn' };
		}
	};
}

function listMyProposals(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_my_proposals',
		description:
			'List the proposals you are a speaker on, with status. Same data as the speaker portal.',
		inputSchema: {},
		handler: async () => {
			const rows = await mySubmissions(ctx.userId);
			return {
				count: rows.length,
				proposals: rows.map((row) => ({
					id: row.id,
					title: row.title,
					status: row.status,
					isPrimary: row.isPrimary,
					submittedAt: row.submittedAt?.toISOString() ?? null,
					decidedAt: row.decidedAt?.toISOString() ?? null,
					conference: row.conference
				}))
			};
		}
	};
}

function updateMySpeakerProfile(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'update_my_speaker_profile',
		description:
			'Update your speaker profile — name, bio, job title, company, photo URL and links. ' +
			'Same functions as the speaker portal (`updateOwnProfile`, `setOwnHeadshot`). ' +
			'A profile belongs to one organizer, not to you globally, so you have one per ' +
			'organization you have spoken for. With no profile yet, pass conferenceSlug and ' +
			"one is created for that conference's organizer — you can do this before your " +
			'first proposal, and submit_proposal will copy it into any further organization. ' +
			'Email cannot be changed here. With more than one profile, pass profileId or ' +
			'conferenceSlug; otherwise the first is used. Omit a field to leave it as it is.',
		inputSchema: {
			profileId: z.number().int().optional(),
			conferenceSlug: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Slug from list_open_cfps. Picks the profile for that conference's organizer, " +
						'creating it if you have none there.'
				),
			name: z.string().min(1).optional(),
			sortName: z.string().optional(),
			jobTitle: z.string().nullable().optional(),
			company: z.string().nullable().optional(),
			bio: z.string().nullable().optional(),
			headshotUrl: z
				.string()
				.nullable()
				.optional()
				.describe('Photo URL. Null clears it. Omit to keep the current one.'),
			links: z
				.array(
					z.object({
						label: z.string(),
						url: z.string().min(1)
					})
				)
				.optional()
				.describe('Public links (http or https). Omit to keep the current ones.')
		},
		handler: async (args) => {
			const profiles = await myProfiles(ctx.userId);
			let profile =
				args.profileId === undefined
					? profiles[0]
					: profiles.find((row) => row.id === args.profileId);

			// A slug names the organization, which is the one thing a profile cannot
			// do without — so it is also what lets one be created before any proposal
			// exists (#334). It wins over the positional default: a caller who says
			// which conference they mean should not be edited into a different one.
			if (args.conferenceSlug !== undefined && args.profileId === undefined) {
				const forConference = await ensureProfileForConference(ctx.userId, args.conferenceSlug);
				if (!forConference) {
					throw new McpToolError(
						`No published conference at slug "${args.conferenceSlug}". Call list_open_cfps.`
					);
				}
				profile = forConference;
			}

			if (!profile) {
				throw new McpToolError(
					'No speaker profile of yours to update. A profile belongs to one organizer: ' +
						'pass conferenceSlug (from list_open_cfps) and one is created there.'
				);
			}
			if (
				args.name === undefined &&
				args.sortName === undefined &&
				args.jobTitle === undefined &&
				args.company === undefined &&
				args.bio === undefined &&
				args.headshotUrl === undefined &&
				args.links === undefined
			) {
				throw new McpToolError(
					'Pass at least one of name, sortName, jobTitle, company, bio, headshotUrl or links.'
				);
			}

			let links = parseSpeakerLinks(profile.links);
			if (args.links !== undefined) {
				const incoming = args.links as { label: string; url: string }[];
				const invalid = incoming.find((link) => !isPublishableUrl(link.url));
				if (invalid) {
					throw new McpToolError(
						`Link "${invalid.url}" is not a public http(s) address and cannot be stored.`
					);
				}
				links = incoming;
			}

			const ok = await updateOwnProfile(ctx.userId, profile.id, {
				name: args.name ?? profile.name,
				sortName: args.sortName ?? profile.sortName,
				jobTitle: args.jobTitle !== undefined ? (args.jobTitle ?? '') : (profile.jobTitle ?? ''),
				company: args.company !== undefined ? (args.company ?? '') : (profile.company ?? ''),
				bio: args.bio !== undefined ? (args.bio ?? '') : (profile.bio ?? ''),
				links
			});
			if (!ok) throw new McpToolError('Could not update that profile.');

			if (args.headshotUrl !== undefined) {
				if (args.headshotUrl !== null && !isPublishableUrl(args.headshotUrl)) {
					throw new McpToolError(
						`Photo URL "${args.headshotUrl}" is not a public http(s) address and cannot be stored.`
					);
				}
				const photo = await setOwnHeadshot(ctx.userId, profile.id, args.headshotUrl);
				if (!photo) throw new McpToolError('Could not update that profile photo.');
			}

			const [updated] = (await myProfiles(ctx.userId)).filter((row) => row.id === profile.id);
			return {
				profileId: profile.id,
				name: updated?.name ?? args.name ?? profile.name,
				bio: updated?.bio ?? null,
				jobTitle: updated?.jobTitle ?? null,
				company: updated?.company ?? null,
				headshotUrl: updated?.headshotUrl ?? null,
				links: parseSpeakerLinks(updated?.links ?? null)
			};
		}
	};
}

function listMyReviewAssignments(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_my_review_assignments',
		description:
			'List the reviews assigned to you. Pass a conference slug to stay on one conference, ' +
			'or omit it to see every conference you review for. Same queue as the reviewer screen ' +
			'(`reviewQueue`) — built from your review rows, so an unassigned submission cannot appear.',
		inputSchema: {
			conferenceSlug: slugField.optional()
		},
		handler: async ({ conferenceSlug }) => {
			const conferences =
				conferenceSlug === undefined
					? await reviewedConferences(ctx.userId)
					: [(await reviewerConference(conferenceSlug, ctx)).conference];

			const assignments = [];
			for (const conference of conferences) {
				const queue = await reviewQueue(conference, ctx.userId);
				for (const row of queue) {
					assignments.push({
						conference: { slug: conference.slug, name: conference.name },
						submissionId: row.submissionId,
						title: row.title,
						ownReviewSubmitted: row.ownReviewSubmitted,
						withdrawn: row.withdrawn,
						window: row.window.state
					});
				}
			}
			return { count: assignments.length, assignments };
		}
	};
}

function getReviewAssignment(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_review_assignment',
		description:
			'Get one assigned submission with the rubric and your current answers. ' +
			'Same function as the reviewer scorecard (`reviewerSubmission`). Peer reviews ' +
			'are withheld until the conference mode allows them — identities of other ' +
			'reviewers are never returned. A submission you were not assigned is refused.',
		inputSchema: {
			conferenceSlug: slugField,
			submissionId: z.number().int()
		},
		handler: async ({ conferenceSlug, submissionId }) => {
			const { conference } = await reviewerConference(conferenceSlug, ctx);
			const detail = await reviewerSubmission(conference, ctx.userId, submissionId);
			if (!detail) {
				throw new McpToolError(
					`No assignment for submission ${submissionId} on "${conferenceSlug}". ` +
						'Call list_my_review_assignments.'
				);
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				submissionId: detail.id,
				title: detail.title,
				abstract: detail.abstract,
				status: detail.status,
				own: detail.own,
				criteria: detail.criteria.map((criterion) => ({
					id: criterion.id,
					label: criterion.label,
					kind: criterion.kind,
					scaleMax: criterion.scaleMax,
					value: criterion.value,
					valueText: criterion.valueText
				})),
				window: detail.window.state,
				peersWithheld: detail.peersWithheld,
				answers: detail.answers
			};
		}
	};
}

function submitReviewTool(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'submit_review',
		description:
			'File your review for an assigned submission. Scores are keyed by criterion id ' +
			'from get_review_assignment. Writing again overwrites, same as the reviewer form ' +
			'(`saveReview`). An empty review is refused. The round window is enforced here, ' +
			'not only on the page.',
		inputSchema: {
			conferenceSlug: slugField,
			submissionId: z.number().int(),
			answers: z
				.record(z.string(), z.string())
				.describe('Criterion id (as a string key) to the score or text you entered.'),
			comment: z.string().optional()
		},
		handler: async ({ conferenceSlug, submissionId, answers, comment }) => {
			const { conference } = await reviewerConference(conferenceSlug, ctx);
			const keyed: Record<number, string> = {};
			for (const [key, value] of Object.entries(answers as Record<string, string>)) {
				const id = Number(key);
				if (!Number.isInteger(id)) {
					throw new McpToolError(`Criterion id "${key}" is not a number.`);
				}
				keyed[id] = value;
			}
			const result = await saveReview(conference, ctx.userId, submissionId, {
				answers: keyed,
				comment: comment ?? '',
				submit: true
			});
			if (!result.ok) {
				const messages: Record<(typeof result)['reason'], string> = {
					not_assigned: `No assignment for submission ${submissionId} on "${conferenceSlug}".`,
					empty_submit: 'A review needs at least a score or a comment.',
					withdrawn: 'The speaker withdrew this talk. It cannot be reviewed.',
					round_not_open: 'This review round has not opened yet.',
					round_closed: 'This review round has closed.'
				};
				throw new McpToolError(messages[result.reason]);
			}
			return { submissionId, submitted: true };
		}
	};
}

export function journeyTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [
		listOpenCfps(),
		submitProposal(ctx),
		updateProposal(ctx),
		finalizeProposal(ctx),
		withdrawProposal(ctx),
		listMyProposals(ctx),
		updateMySpeakerProfile(ctx),
		listMyReviewAssignments(ctx),
		getReviewAssignment(ctx),
		submitReviewTool(ctx)
	];
}
