/**
 * Filing a review through the chat uses the same `submit_review` the MCP
 * server exposes. The write is reversible and stays in the app, so it runs
 * without a card (#726).
 *
 * The reviewer chat that used to carry this is gone (#683): the one assistant
 * does the same work, and the round it writes into now comes from the page's
 * published focus rather than from a per-surface handler's own body field.
 */
import { assignReviewerToSubmissions } from '$lib/server/conference/review-management';
import { addReviewRound } from '$lib/server/conference/review-rounds';
import { reviewerSubmission } from '$lib/server/conference/reviewer';
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import { addScorecardCriterion } from '$lib/server/conference/scorecard-criteria';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import type { McpContext } from '$lib/server/mcp/context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '$lib/server/mcp/harness';
import type { UIMessage } from 'ai';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { streamAssistantChat, type AssistantPageContext } from './assistant';
import { createMockSubmitReviewModel } from './model';

const suffix = `chat302w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;
let ellis: McpContext;
let conference: typeof conferenceTable.$inferSelect;
let submissionId: number;
let criterionId: number;
let roundId: number;
let otherRoundId: number;
let answers: Record<string, string>;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	ellis = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };
	const ellisPerson = seeded.people.find((person) => person.id === ellis.userId)!;
	const seated = await addReviewer(seeded.conferenceId, ellisPerson.email);
	expect(seated.ok).toBe(true);

	const otherRound = await addReviewRound(seeded.conferenceId, {
		name: 'Earlier round',
		anonymized: false,
		opensAt: null,
		closesAt: null
	});
	expect(otherRound.ok).toBe(true);
	if (!otherRound.ok) throw new Error('other round');
	otherRoundId = otherRound.id;

	const round = await addReviewRound(seeded.conferenceId, {
		name: 'Screening',
		anonymized: false,
		opensAt: null,
		closesAt: null
	});
	expect(round.ok).toBe(true);
	if (!round.ok) throw new Error('round');
	roundId = round.id;

	const criterion = await addScorecardCriterion(seeded.conferenceId, round.id, {
		label: 'Fit',
		kind: 'rating',
		scaleMax: 5,
		optionsText: '',
		weight: 1
	});
	expect(criterion.ok).toBe(true);
	if (!criterion.ok || criterion.id == null) throw new Error('criterion');
	criterionId = criterion.id;

	submissionId = seeded.submissionIds['casey-observability'];
	const assignedElsewhere = await assignReviewerToSubmissions(
		seeded.conferenceId,
		[submissionId],
		otherRoundId,
		ellis.userId
	);
	expect(assignedElsewhere.created).toBeGreaterThan(0);
	const assigned = await assignReviewerToSubmissions(
		seeded.conferenceId,
		[submissionId],
		round.id,
		ellis.userId
	);
	expect(assigned.created).toBeGreaterThan(0);

	const [row] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.id, seeded.conferenceId));
	conference = row;
	answers = { [String(criterionId)]: '4' };
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

/** The scorecard page as the panel reports it: route, heading and what is selected. */
const scorecard = (): AssistantPageContext => ({
	routeId: '/(protected)/(with-sidebar)/review/[slug]/[submissionId]',
	url: `/review/${conference.slug}/${submissionId}`,
	title: 'Observability for agents that call tools',
	params: { slug: conference.slug, submissionId: String(submissionId) },
	focus: {
		submissionId: String(submissionId),
		talk: 'Observability for agents that call tools',
		roundId: String(roundId),
		round: 'Screening'
	}
});

const userTurn = (): UIMessage => ({
	id: 'u1',
	role: 'user',
	parts: [{ type: 'text', text: 'File my review of this talk: 4 on Fit.' }]
});

describe('assistant submit_review (#302, #683)', () => {
	it('writes through saveReview on the first turn, without a card', async () => {
		const res = await streamAssistantChat({
			ctx: ellis,
			messages: [userTurn()],
			model: createMockSubmitReviewModel({
				conferenceSlug: conference.slug,
				submissionId,
				answers
			}),
			page: scorecard()
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('submit_review');
		expect(body).not.toContain('tool-approval-request');
		expect(body).toMatch(/Saved review|4/);

		const after = await reviewerSubmission(conference, ellis.userId, submissionId, roundId);
		expect(after?.own.status).toBe('submitted');
		expect(after?.criteria[0]?.value).toBe(4);

		const otherRound = await reviewerSubmission(
			conference,
			ellis.userId,
			submissionId,
			otherRoundId
		);
		expect(otherRound?.own.status).toBe('assigned');
	});

	// The panel reads this shape: a refusal finishes like a write, so a tool
	// part that only looked at its state would paint "Saved review" over a
	// review that was never filed (#302, same seam as the agenda board).
	it('streams { error } and writes nothing when the reviewer is not assigned', async () => {
		const strangerId = seeded.submissionIds['drew-migrations'];
		const res = await streamAssistantChat({
			ctx: ellis,
			messages: [userTurn()],
			model: createMockSubmitReviewModel({
				conferenceSlug: conference.slug,
				submissionId: strangerId,
				answers,
				roundId
			})
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('"error"');
		expect(body).toContain(`No assignment for submission ${strangerId}`);

		const after = await reviewerSubmission(conference, ellis.userId, strangerId);
		expect(after?.own.status).not.toBe('submitted');
	});
});
