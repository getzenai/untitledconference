/**
 * Speaker and reviewer tools, measured against the isolated harness tenant
 * and against the loaders a jury or a portal would actually hit — not against
 * the column a tool might have written.
 */
import { asks } from '$lib/conference/fixed-questions';
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
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { and, eq } from 'drizzle-orm';
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
				'finalize_proposal',
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

	// #320: the dead-end. A proposal could be created and edited but never handed
	// in, so an agent-driven speaker journey ended with a draft the organizer
	// could see and nobody had submitted. These use their own draft rather than
	// the shared one, so they do not depend on where the other cases leave it.
	describe('handing a draft in', () => {
		let ownDraftId: number;

		it('refuses a draft that is still missing what the call asks for, and names it', async () => {
			// The premise, stated rather than assumed: this case only bites while the
			// call actually asks for an abstract. If that default ever changes, this
			// line fails instead of the test passing for the wrong reason.
			const open = await openCall(seeded.conferenceSlug);
			expect(asks(open!.fixed, 'abstract')).toBe(true);

			const created = await call(casey, 'submit_proposal', {
				conferenceSlug: seeded.conferenceSlug,
				title: 'Title only, nothing else yet'
			});
			expect(created.data).toMatchObject({ status: 'draft' });
			ownDraftId = created.data!.submissionId as number;

			const refused = await call(casey, 'finalize_proposal', { submissionId: ownDraftId });
			expect(refused.isError).toBe(true);
			// Naming the field is the point: an agent that is only told "invalid"
			// cannot get itself unstuck.
			expect(refused.text).toContain('abstract');

			// And it is still a draft — a refused hand-in must not half-commit.
			const mine = await mySubmissions(casey.userId);
			expect(mine.find((row) => row.id === ownDraftId)?.status).toBe('draft');
		});

		it('hands the draft in once it is complete, and the portal shows it submitted', async () => {
			await call(casey, 'update_proposal', {
				conferenceSlug: seeded.conferenceSlug,
				submissionId: ownDraftId,
				abstract: 'Now it says what the talk is about.'
			});

			const filed = await call(casey, 'finalize_proposal', { submissionId: ownDraftId });
			expect(filed.isError).toBe(false);
			expect(filed.data).toMatchObject({ submissionId: ownDraftId, status: 'submitted' });

			// Read back through the portal loader, not the tool's own return value.
			const mine = await mySubmissions(casey.userId);
			const row = mine.find((entry) => entry.id === ownDraftId);
			expect(row?.status).toBe('submitted');
			expect(row?.submittedAt).not.toBeNull();
		});

		it('is idempotent — a second hand-in moves nothing and sends no second receipt', async () => {
			const receipts = async () =>
				(
					await db
						.select({ id: emailLogTable.id })
						.from(emailLogTable)
						.where(
							and(
								eq(emailLogTable.relatedType, 'submission'),
								eq(emailLogTable.relatedId, ownDraftId),
								eq(emailLogTable.template, 'submission_received')
							)
						)
				).length;

			const before = await mySubmissions(casey.userId);
			const arrivedAt = before.find((row) => row.id === ownDraftId)?.submittedAt;
			const receiptsBefore = await receipts();
			expect(receiptsBefore).toBeGreaterThan(0);

			const again = await call(casey, 'finalize_proposal', { submissionId: ownDraftId });
			expect(again.isError).toBe(false);
			expect(again.data).toMatchObject({ status: 'submitted' });

			const after = await mySubmissions(casey.userId);
			expect(after.find((row) => row.id === ownDraftId)?.submittedAt).toEqual(arrivedAt);
			expect(await receipts()).toBe(receiptsBefore);
		});

		it('refuses a proposal that is not the caller’s', async () => {
			const refused = await call(finley, 'finalize_proposal', { submissionId: ownDraftId });
			expect(refused.isError).toBe(true);
			expect(refused.text).toContain('yours');
		});
	});

	it('carries the format length into the speaker\u2019s view of the call', async () => {
		await call(organizer, 'create_session_format', {
			conferenceSlug: seeded.conferenceSlug,
			name: 'Deep Dive',
			minutes: 75
		});

		const listed = await call(casey, 'list_open_cfps');
		const mine = (listed.data!.calls as { slug: string; formats: unknown[] }[]).find(
			(row) => row.slug === seeded.conferenceSlug
		)!;
		expect(mine.formats).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'Deep Dive', minutes: 75 })])
		);

		// Against the loader the organizer screen reads, not just against itself:
		// the point of #339 is that these two disagreed.
		const open = await openCall(seeded.conferenceSlug);
		expect(open!.formats.find((format) => format.name === 'Deep Dive')?.minutes).toBe(75);
	});

	it('names its successor in what it returns, not only in its description', async () => {
		const created = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'A draft that says what comes next'
		});
		expect(created.data).toMatchObject({ status: 'draft', next: 'finalize_proposal' });
	});

	it('reports the status the row has, not the one the save intended', async () => {
		const created = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Already picked up by a reviewer',
			abstract: 'Complete enough to hand in.'
		});
		const submissionId = created.data!.submissionId as number;
		await call(casey, 'finalize_proposal', { submissionId });

		// Set by hand because nothing in the product writes `in_review` yet — the
		// status is in the enum, `submissionValues` preserves it, and the loaders
		// read it, but no path sets it. The contradiction #331 describes is
		// reachable the moment one does, so the guard belongs here now.
		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(eq(submissionTable.id, submissionId));

		const again = await call(casey, 'finalize_proposal', { submissionId });
		expect(again.isError).toBe(false);
		expect(again.data).toMatchObject({ status: 'in_review' });

		// And the portal agrees — the hand-in did not push it back to `submitted`.
		const mine = await mySubmissions(casey.userId);
		expect(mine.find((row) => row.id === submissionId)?.status).toBe('in_review');
	});

	it('gives a co-presenter the same read-back, and does not hand them the talk', async () => {
		// The read above asks `ownedSubmission` as `'speaker'`, not `'primary'`, and
		// this is the case that tells the two apart: a co-presenter may hand a
		// proposal in, so asking as the primary would answer `null` and drop the
		// status back onto the derived value the read exists to replace (#331).
		const drewPerson = seeded.people.find((person) => person.id === seeded.speakerIds[1])!;
		const created = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Handed in by the other speaker',
			abstract: 'Complete enough to hand in.',
			coSpeakers: [{ name: drewPerson.name, email: drewPerson.email }]
		});
		const submissionId = created.data!.submissionId as number;

		// Drew's own portal read is what attaches the account to the profile Casey
		// created for that address — the premise of everything below.
		expect((await mySubmissions(drew.userId)).some((row) => row.id === submissionId)).toBe(true);

		// Same hand-set status as above, for the same reason.
		await db
			.update(submissionTable)
			.set({ status: 'in_review' })
			.where(eq(submissionTable.id, submissionId));

		const handed = await call(drew, 'finalize_proposal', { submissionId });
		expect(handed.isError).toBe(false);
		expect(handed.data).toMatchObject({ status: 'in_review' });

		// And the talk is still Casey's: the save no longer decides who holds it
		// (#330), so this is the whole journey rather than the unit underneath it.
		const caseys = await mySubmissions(casey.userId);
		expect(caseys.find((row) => row.id === submissionId)?.isPrimary).toBe(true);
	});

	it('creates a first speaker profile from the conference, before any proposal exists', async () => {
		// Finley has only ever reviewed, so this is the fresh-account branch #334
		// describes without needing a new account.
		expect(await myProfiles(finley.userId)).toHaveLength(0);

		const refused = await call(finley, 'update_my_speaker_profile', { bio: 'No profile yet.' });
		expect(refused.isError).toBe(true);
		// The message has to name the way out, or an agent stops here.
		expect(refused.text).toContain('conferenceSlug');

		const created = await call(finley, 'update_my_speaker_profile', {
			conferenceSlug: seeded.conferenceSlug,
			jobTitle: 'Staff Engineer',
			bio: 'Wrote the bio before the talk.'
		});
		expect(created.isError).toBe(false);

		const [profile] = await myProfiles(finley.userId);
		expect(profile).toMatchObject({
			organizationId: seeded.orgId,
			jobTitle: 'Staff Engineer',
			bio: 'Wrote the bio before the talk.'
		});

		// A second call with the same slug edits that profile rather than forking it.
		await call(finley, 'update_my_speaker_profile', {
			conferenceSlug: seeded.conferenceSlug,
			company: 'Harness Ltd'
		});
		const after = await myProfiles(finley.userId);
		expect(after).toHaveLength(1);
		expect(after[0].id).toBe(profile.id);
		expect(after[0].company).toBe('Harness Ltd');
	});

	it('refuses a slug that is not a published conference', async () => {
		const refused = await call(casey, 'update_my_speaker_profile', {
			conferenceSlug: `${seeded.conferenceSlug}-nope`,
			bio: 'Nowhere to put this.'
		});
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('list_open_cfps');
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
