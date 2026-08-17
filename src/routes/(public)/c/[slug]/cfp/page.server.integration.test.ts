/**
 * A signed-in speaker with a profile at this organizer must not meet a blank
 * About-you section (#558). The public call never used to load a profile, so
 * someone who had already spoken three times typed name, bio and email again.
 *
 * Parts 2 and 3 pin the write: a change here updates that same profile, and a
 * second proposal from the same account links to it instead of forking one.
 */
import { emptyProposal } from '$lib/conference/proposal-draft';
import { saveSubmission, type SubmissionInput } from '$lib/server/conference/cfp-submission';
import {
	clearRegistrationProposal,
	parkRegistrationProposal
} from '$lib/server/conference/registration-proposal';
import { db } from '$lib/server/db';
import { organization, user, verification } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load, type CfpSpeakerProfile } from './+page.server';

const suffix = `cfp-prefill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const otherOrgId = `other-org-${suffix}`;
const speakerId = `speaker-${suffix}`;
const slug = `conf-${suffix}`;

/** `load` throws on 404; a successful visit always has this shape. */
type Loaded = { speakerProfile: CfpSpeakerProfile | null };

const visit = async (userId: string | null): Promise<Loaded> =>
	(await load({
		params: { slug },
		locals: userId ? { user: { id: userId } } : {}
	} as unknown as Parameters<typeof load>[0])) as Loaded;

beforeAll(async () => {
	await db.insert(organization).values([
		{ id: organizationId, name: 'Northwind', slug: organizationId, createdAt: new Date() },
		{ id: otherOrgId, name: 'Contoso', slug: otherOrgId, createdAt: new Date() }
	]);
	await db.insert(user).values({
		id: speakerId,
		email: `${speakerId}@example.test`,
		emailVerified: true,
		name: 'Priya Raman'
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Northwind Summit',
			slug,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	await db.insert(cfpFormTable).values({
		conferenceId: conference.id,
		title: 'Call for papers',
		status: 'published'
	});

	await db.insert(speakerProfileTable).values({
		organizationId,
		userId: speakerId,
		name: 'Priya Raman',
		sortName: 'Raman, Priya',
		email: `${speakerId}@example.test`,
		jobTitle: 'Staff Engineer',
		company: 'Northwind Labs',
		bio: 'Works on build systems.'
	});

	await db.insert(speakerProfileTable).values({
		organizationId: otherOrgId,
		userId: speakerId,
		name: 'P. Raman',
		sortName: 'Raman, P.',
		email: `${speakerId}@example.test`,
		bio: 'A Contoso-only bio that must not leak into Northwind.'
	});
});

describe('the public call prefills a speaker profile at this organizer', () => {
	it('fills the About-you fields from the profile at this organization', async () => {
		const data = (await visit(speakerId)) as Loaded;

		expect(data.speakerProfile).toEqual({
			organizationName: 'Northwind',
			speaker: {
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: `${speakerId}@example.test`,
				jobTitle: 'Staff Engineer',
				company: 'Northwind Labs',
				bio: 'Works on build systems.'
			}
		});
	});

	it('leaves the form empty when nobody is signed in', async () => {
		const data = (await visit(null)) as Loaded;

		expect(data.speakerProfile).toBeNull();
	});

	it('does not carry a profile from another organizer into this call', async () => {
		const strangerId = `stranger-${suffix}`;
		await db.insert(user).values({
			id: strangerId,
			email: `${strangerId}@example.test`,
			emailVerified: true,
			name: 'Jordan Vale'
		});
		await db.insert(speakerProfileTable).values({
			organizationId: otherOrgId,
			userId: strangerId,
			name: 'Jordan Vale',
			sortName: 'Vale, Jordan',
			email: `${strangerId}@example.test`,
			bio: 'Only ever spoke at Contoso.'
		});

		const data = (await visit(strangerId)) as Loaded;

		expect(data.speakerProfile).toBeNull();
	});
});

function proposal(title: string, bio: string): SubmissionInput {
	return {
		title,
		abstract: 'An abstract.',
		keyTakeaway: null,
		audienceLevel: null,
		sessionFormatId: null,
		trackId: null,
		answers: {},
		speaker: {
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: `${speakerId}@example.test`,
			jobTitle: 'Staff Engineer',
			company: 'Northwind Labs',
			bio
		},
		coSpeakers: []
	};
}

/**
 * The write the notice above the form is talking about (#558 parts 2 and 3).
 *
 * A second proposal from the same account must land on the same profile — that
 * is the merge. A bio change on that second save must rewrite that row, not
 * open a second one — that is the named scope, and why the public page has to
 * say "every talk" before Submit.
 */
describe('the public call writes the existing profile, not a fork', () => {
	it('keeps one profile across two proposals and applies a bio change to it', async () => {
		const slugB = `conf-b-${suffix}`;
		const [conferenceB] = await db
			.insert(conferenceTable)
			.values({
				organizationId,
				name: 'Northwind Summit II',
				slug: slugB,
				startsOn: '2028-05-12',
				endsOn: '2028-05-12',
				status: 'published'
			})
			.returning();
		await db.insert(cfpFormTable).values({
			conferenceId: conferenceB.id,
			title: 'Call for papers',
			status: 'published'
		});

		const [before] = await db
			.select({ id: speakerProfileTable.id, bio: speakerProfileTable.bio })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.userId, speakerId)
				)
			);
		expect(before.bio).toBe('Works on build systems.');

		const first = await saveSubmission(speakerId, slug, proposal('Talk A', before.bio ?? ''), {
			submit: true
		});
		const second = await saveSubmission(
			speakerId,
			slugB,
			proposal('Talk B', 'Rewritten for the second talk.'),
			{ submit: true }
		);
		if (!first.ok || !second.ok) {
			throw new Error(`expected two saves, got ${JSON.stringify({ first, second })}`);
		}

		const profiles = await db
			.select({ id: speakerProfileTable.id, bio: speakerProfileTable.bio })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.userId, speakerId)
				)
			);
		expect(profiles).toHaveLength(1);
		expect(profiles[0].id).toBe(before.id);
		expect(profiles[0].bio).toBe('Rewritten for the second talk.');

		const linked = await db
			.select({ profileId: submissionSpeakerTable.speakerProfileId })
			.from(submissionSpeakerTable)
			.where(eq(submissionSpeakerTable.submissionId, first.submissionId));
		const linkedB = await db
			.select({ profileId: submissionSpeakerTable.speakerProfileId })
			.from(submissionSpeakerTable)
			.where(eq(submissionSpeakerTable.submissionId, second.submissionId));
		expect(linked.map((row) => row.profileId)).toEqual([before.id]);
		expect(linkedB.map((row) => row.profileId)).toEqual([before.id]);
	});
});

/**
 * After #878 a decided talk is `existing`. The loader used to skip the
 * registration handoff whenever `existing` was set, so the unsigned second
 * title never reached the page (#881). Same gate persist already uses:
 * an *open* proposal, not a server copy.
 */
describe('the public call still hands a parked second draft after a decision (#881)', () => {
	const handoffSpeakerId = `handoff-${suffix}`;
	const parked = {
		...emptyProposal(),
		title: 'Unsigned second try',
		abstract: 'Typed before they signed back in.'
	};
	const adapter = {
		deleteVerificationByIdentifier: async (identifier: string) => {
			await db.delete(verification).where(eq(verification.identifier, identifier));
		},
		createVerificationValue: async (value: {
			identifier: string;
			value: string;
			expiresAt: Date;
		}) => {
			const now = new Date();
			return db
				.insert(verification)
				.values({ id: nanoid(), ...value, createdAt: now, updatedAt: now })
				.returning();
		}
	};

	const visitAs = async (userId: string) =>
		load({
			params: { slug },
			locals: { user: { id: userId } }
		} as unknown as Parameters<typeof load>[0]) as Promise<{
			existing: { id: number; status: string } | null;
			pendingProposal: { draft: { title: string } } | null;
		}>;

	beforeAll(async () => {
		await db.insert(user).values({
			id: handoffSpeakerId,
			email: `${handoffSpeakerId}@example.test`,
			emailVerified: true,
			name: 'Second Try'
		});
	});

	afterAll(async () => {
		await clearRegistrationProposal(handoffSpeakerId, slug);
		await db.delete(user).where(eq(user.id, handoffSpeakerId));
	});

	const asSpeaker = (userId: string, name: string, title: string): SubmissionInput => ({
		...proposal(title, 'Works on build systems.'),
		speaker: {
			...proposal(title, 'Works on build systems.').speaker,
			name,
			email: `${userId}@example.test`
		}
	});

	it('returns the parked title when the first talk was declined', async () => {
		const saved = await saveSubmission(
			handoffSpeakerId,
			slug,
			asSpeaker(handoffSpeakerId, 'Second Try', 'Not this year'),
			{ submit: true }
		);
		if (!saved.ok) throw new Error('expected a submitted proposal');
		await db
			.update(submissionTable)
			.set({ status: 'rejected', decidedAt: new Date() })
			.where(eq(submissionTable.id, saved.submissionId));

		await parkRegistrationProposal(adapter, handoffSpeakerId, {
			slug,
			draft: parked,
			intent: 'submit'
		});

		const data = await visitAs(handoffSpeakerId);
		expect(data.existing?.status).toBe('rejected');
		expect(data.pendingProposal?.draft.title).toBe('Unsigned second try');
	});

	it('still returns the parked title when there is no server copy', async () => {
		const freshId = `fresh-${suffix}`;
		await db.insert(user).values({
			id: freshId,
			email: `${freshId}@example.test`,
			emailVerified: true,
			name: 'Fresh'
		});
		try {
			await parkRegistrationProposal(adapter, freshId, {
				slug,
				draft: parked,
				intent: 'submit'
			});
			const data = await visitAs(freshId);
			expect(data.existing).toBeNull();
			expect(data.pendingProposal?.draft.title).toBe('Unsigned second try');
		} finally {
			await clearRegistrationProposal(freshId, slug);
			await db.delete(user).where(eq(user.id, freshId));
		}
	});

	it('keeps a draft on the existing branch and does not fetch the handoff (#815)', async () => {
		const draftSpeakerId = `draft-handoff-${suffix}`;
		await db.insert(user).values({
			id: draftSpeakerId,
			email: `${draftSpeakerId}@example.test`,
			emailVerified: true,
			name: 'Draft'
		});
		try {
			const saved = await saveSubmission(
				draftSpeakerId,
				slug,
				asSpeaker(draftSpeakerId, 'Draft', 'Half a thought'),
				{ submit: false }
			);
			if (!saved.ok) throw new Error('expected a draft');

			await parkRegistrationProposal(adapter, draftSpeakerId, {
				slug,
				draft: parked,
				intent: 'submit'
			});

			const data = await visitAs(draftSpeakerId);
			expect(data.existing?.status).toBe('draft');
			expect(data.pendingProposal).toBeNull();
		} finally {
			await clearRegistrationProposal(draftSpeakerId, slug);
			await db.delete(user).where(eq(user.id, draftSpeakerId));
		}
	});
});
