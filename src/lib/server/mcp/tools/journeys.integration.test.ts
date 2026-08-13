/**
 * Speaker and reviewer tools, measured against the isolated harness tenant
 * and against the loaders a jury or a portal would actually hit — not against
 * the column a tool might have written.
 */
import {
	guessSortName,
	listOpenCalls,
	openCall,
	saveSubmission
} from '$lib/server/conference/cfp-submission';
import { listPublishedConferences } from '$lib/server/conference/public-conference';
import { addReviewRound } from '$lib/server/conference/review-rounds';
import { reviewerSubmission, reviewQueue } from '$lib/server/conference/reviewer';
import { addScorecardCriterion } from '$lib/server/conference/scorecard-criteria';
import { mySubmissions } from '$lib/server/conference/speaker-portal';
import { myProfiles } from '$lib/server/conference/speaker-profile';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '../harness';
import { registerAllTools } from '../server';

const suffix = `mcpjourney-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	registerAllTools(
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
let casey: McpContext;
let drew: McpContext;
let ellis: McpContext;
let finley: McpContext;
let draftId: number | undefined;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	casey = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
	drew = { userId: seeded.speakerIds[1], organizationId: seeded.orgId };
	ellis = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };
	finley = { userId: seeded.reviewerIds[1], organizationId: seeded.orgId };
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('speaker and reviewer tools', () => {
	it('registers every tool the issue names', () => {
		const names = [...toolsFor(casey).keys()];
		expect(names).toEqual(
			expect.arrayContaining([
				'list_open_cfps',
				'submit_proposal',
				'update_proposal',
				'withdraw_proposal',
				'list_my_proposals',
				'update_my_speaker_profile',
				'list_my_review_assignments',
				'get_review_assignment',
				'submit_review'
			])
		);
	});

	it('hides the harness call while the conference is a draft', async () => {
		const listed = await call(casey, 'list_open_cfps');
		expect(listed.isError).toBe(false);
		const slugs = (listed.data!.calls as { slug: string }[]).map((row) => row.slug);
		expect(slugs).not.toContain(seeded.conferenceSlug);
		expect(await openCall(seeded.conferenceSlug)).toBeNull();
		expect(await listOpenCalls()).toEqual(
			expect.not.arrayContaining([expect.objectContaining({ slug: seeded.conferenceSlug })])
		);
	});

	it('lists the call once it is published — the same gate as the public site', async () => {
		await call(organizer, 'open_cfp', { conferenceSlug: seeded.conferenceSlug });
		await call(organizer, 'publish_conference', { conferenceSlug: seeded.conferenceSlug });

		expect((await openCall(seeded.conferenceSlug))?.state).toBe('open');
		expect(
			(await listPublishedConferences()).some((row) => row.slug === seeded.conferenceSlug)
		).toBe(true);

		const listed = await call(casey, 'list_open_cfps');
		expect(
			(listed.data!.calls as { slug: string }[]).some((row) => row.slug === seeded.conferenceSlug)
		).toBe(true);
	});

	it('files a draft through saveSubmission and lists it on the portal', async () => {
		const drewPerson = seeded.people.find((person) => person.id === seeded.speakerIds[1])!;
		const created = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Harness draft talk',
			abstract: 'A draft the speaker can still rewrite.',
			coSpeakers: [{ name: drewPerson.name, email: drewPerson.email }]
		});
		expect(created.isError).toBe(false);
		expect(created.data).toMatchObject({ status: 'draft' });

		const mine = await mySubmissions(casey.userId);
		expect(
			mine.some((row) => row.id === created.data!.submissionId && row.status === 'draft')
		).toBe(true);

		const listed = await call(casey, 'list_my_proposals');
		expect(
			(listed.data!.proposals as { id: number; status: string }[]).some(
				(row) => row.id === created.data!.submissionId && row.status === 'draft'
			)
		).toBe(true);

		const drewList = await call(drew, 'list_my_proposals');
		expect(
			(drewList.data!.proposals as { id: number; isPrimary: boolean }[]).some(
				(row) => row.id === created.data!.submissionId && row.isPrimary === false
			)
		).toBe(true);

		draftId = created.data!.submissionId as number;
	});

	it('lets the owner rewrite the draft and refuses someone who is not a speaker on it', async () => {
		expect(draftId).toBeTruthy();

		const updated = await call(casey, 'update_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: draftId,
			title: 'Harness draft talk, revised'
		});
		expect(updated.isError).toBe(false);
		expect(updated.data).toMatchObject({ status: 'draft' });

		const mine = await mySubmissions(casey.userId);
		expect(mine.find((row) => row.id === draftId)?.title).toBe('Harness draft talk, revised');

		const refused = await call(finley, 'update_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: draftId,
			title: 'Finley should not be able to rename this'
		});
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('not yours');
	});

	it('updates the speaker profile through the same functions the portal uses', async () => {
		const updated = await call(casey, 'update_my_speaker_profile', {
			bio: 'Casey writes about harness talks.',
			headshotUrl: 'https://mcpharness.example/casey.jpg',
			links: [{ label: 'Site', url: 'https://casey.example' }]
		});
		expect(updated.isError).toBe(false);
		expect(updated.data).toMatchObject({
			bio: 'Casey writes about harness talks.',
			headshotUrl: 'https://mcpharness.example/casey.jpg'
		});

		const [profile] = await myProfiles(casey.userId);
		expect(profile.bio).toBe('Casey writes about harness talks.');
		expect(profile.headshotUrl).toBe('https://mcpharness.example/casey.jpg');
	});

	it('withdraws through withdrawSubmission — the portal then shows withdrawn', async () => {
		const submissionId = draftId!;
		const withdrawn = await call(casey, 'withdraw_proposal', { submissionId });
		expect(withdrawn.isError).toBe(false);
		expect(withdrawn.data).toMatchObject({ status: 'withdrawn' });

		const mine = await mySubmissions(casey.userId);
		expect(mine.find((row) => row.id === submissionId)?.status).toBe('withdrawn');

		const again = await call(casey, 'withdraw_proposal', { submissionId });
		expect(again.isError).toBe(true);
		expect(again.text).toContain('decision');
	});

	it('refuses a speaker the reviewer tools', async () => {
		const listed = await call(casey, 'list_my_review_assignments', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(listed.isError).toBe(true);
		expect(listed.text).toContain('that you review for');
	});

	it('shows Ellis only the assignment the queue would show, and files a review through saveReview', async () => {
		const caseyPerson = seeded.people.find((person) => person.id === casey.userId)!;
		const filed = await saveSubmission(
			casey.userId,
			seeded.conferenceSlug,
			{
				title: 'Talk for review',
				abstract: 'Submitted so a reviewer can score it.',
				keyTakeaway: null,
				audienceLevel: null,
				sessionFormatId: null,
				trackId: null,
				answers: {},
				speaker: {
					name: caseyPerson.name,
					sortName: guessSortName(caseyPerson.name),
					email: caseyPerson.email,
					jobTitle: null,
					company: null,
					bio: null
				},
				coSpeakers: []
			},
			{ submit: true }
		);
		expect(filed.ok).toBe(true);
		if (!filed.ok) return;

		const ellisPerson = seeded.people.find((person) => person.id === ellis.userId)!;
		const invited = await call(organizer, 'invite_reviewer', {
			conferenceSlug: seeded.conferenceSlug,
			email: ellisPerson.email
		});
		expect(invited.isError).toBe(false);

		const round = await addReviewRound(seeded.conferenceId, {
			name: 'Screening',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(round.ok).toBe(true);
		if (!round.ok) return;

		const criterion = await addScorecardCriterion(seeded.conferenceId, round.id, {
			label: 'Fit',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(criterion.ok).toBe(true);

		const assigned = await call(organizer, 'assign_reviews', {
			conferenceSlug: seeded.conferenceSlug,
			submissionIds: [filed.submissionId],
			reviewerEmail: ellisPerson.email,
			roundId: round.id
		});
		expect(assigned.isError).toBe(false);

		const [conference] = await db
			.select()
			.from(conferenceTable)
			.where(eq(conferenceTable.id, seeded.conferenceId))
			.limit(1);

		const queue = await reviewQueue(conference, ellis.userId);
		expect(queue.some((row) => row.submissionId === filed.submissionId)).toBe(true);

		const listed = await call(ellis, 'list_my_review_assignments', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(
			(listed.data!.assignments as { submissionId: number }[]).some(
				(row) => row.submissionId === filed.submissionId
			)
		).toBe(true);

		const stranger = await call(drew, 'get_review_assignment', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: filed.submissionId
		});
		expect(stranger.isError).toBe(true);

		const detail = await call(ellis, 'get_review_assignment', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: filed.submissionId
		});
		expect(detail.isError).toBe(false);
		expect(detail.data).toMatchObject({
			submissionId: filed.submissionId,
			title: 'Talk for review'
		});
		const criteria = detail.data!.criteria as { id: number }[];
		expect(criteria.length).toBeGreaterThan(0);

		const scored = await call(ellis, 'submit_review', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: filed.submissionId,
			answers: { [String(criteria[0].id)]: '4' },
			comment: 'Clear fit for the harness track.'
		});
		expect(scored.isError).toBe(false);

		const again = await call(ellis, 'submit_review', {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: filed.submissionId,
			answers: { [String(criteria[0].id)]: '5' },
			comment: 'Even clearer on a second read.'
		});
		expect(again.isError).toBe(false);

		const after = await reviewerSubmission(conference, ellis.userId, filed.submissionId);
		expect(after?.own.comment).toBe('Even clearer on a second read.');
		expect(after?.own.status).toBe('submitted');
		expect(after?.criteria[0]?.value).toBe(5);
	});
});
