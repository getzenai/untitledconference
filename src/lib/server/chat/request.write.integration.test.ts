/**
 * Filing a review through the chat uses the same `submit_review` the MCP
 * server exposes. The first turn asks; the write only happens after the
 * reviewer confirms (#302).
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
import { createMockSubmitReviewModel } from './model';
import { streamReviewerChat } from './request';

const suffix = `chat302w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;
let ellis: McpContext;
let conference: typeof conferenceTable.$inferSelect;
let submissionId: number;
let criterionId: number;
let answers: Record<string, string>;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	ellis = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };
	const ellisPerson = seeded.people.find((person) => person.id === ellis.userId)!;
	const seated = await addReviewer(seeded.conferenceId, ellisPerson.email);
	expect(seated.ok).toBe(true);

	const round = await addReviewRound(seeded.conferenceId, {
		name: 'Screening',
		anonymized: false,
		opensAt: null,
		closesAt: null
	});
	expect(round.ok).toBe(true);
	if (!round.ok) throw new Error('round');

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

const userTurn = (): UIMessage => ({
	id: 'u1',
	role: 'user',
	parts: [{ type: 'text', text: 'File my review of this talk: 4 on Fit.' }]
});

describe('reviewer chat submit_review (#302)', () => {
	it('does not write until the reviewer confirms', async () => {
		const res = await streamReviewerChat({
			ctx: ellis,
			conference: { name: conference.name, slug: conference.slug },
			messages: [userTurn()],
			model: createMockSubmitReviewModel({
				conferenceSlug: conference.slug,
				submissionId,
				answers
			}),
			focus: { submissionId, title: 'Observability for agents that call tools' }
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('submit_review');

		const before = await reviewerSubmission(conference, ellis.userId, submissionId);
		expect(before?.own.status).not.toBe('submitted');
		expect(before?.criteria[0]?.value).not.toBe(4);
	});

	it('writes through saveReview once the call is approved', async () => {
		const approved: UIMessage[] = [
			userTurn(),
			{
				id: 'a1',
				role: 'assistant',
				parts: [
					{
						type: 'tool-submit_review',
						toolCallId: 'call_submit',
						state: 'approval-responded',
						input: {
							conferenceSlug: conference.slug,
							submissionId,
							answers,
							comment: ''
						},
						approval: { id: 'appr_1', approved: true }
					}
				]
			}
		];

		const res = await streamReviewerChat({
			ctx: ellis,
			conference: { name: conference.name, slug: conference.slug },
			messages: approved,
			model: createMockSubmitReviewModel(
				{ conferenceSlug: conference.slug, submissionId, answers },
				true
			),
			focus: { submissionId, title: 'Observability for agents that call tools' }
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toMatch(/Saved review|submit_review|4/);

		const after = await reviewerSubmission(conference, ellis.userId, submissionId);
		expect(after?.own.status).toBe('submitted');
		expect(after?.criteria[0]?.value).toBe(4);
	});
});
