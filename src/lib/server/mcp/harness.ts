/**
 * The isolated MCP playground — own organisation, own accounts, own conference.
 *
 * An agent driving the eval journeys must not appear on the public site the
 * jury is clicking. The isolation is the conference's own `draft` status, the
 * same gate `loadPublicConference` and `listPublishedConferences` already
 * apply: a draft answers 404 at `/c/<slug>` and is absent from `/`. No flag,
 * no second database, no row in the DevFlow or AI Engineer seeds.
 *
 * This module is the shape the seed script writes (`scripts/db/seed-mcp-harness.mjs`,
 * identifiers in `seed-mcp-harness-data.mjs`) and the shape the later tool PRs
 * measure against. `harness.unit.test.ts` fails if the two copies drift.
 */
import { createConference } from '$lib/server/conference/create-conference';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';

export const MCP_HARNESS_EMAIL_DOMAIN = 'mcpharness.example';

/**
 * One password for every harness account.
 *
 * Not a secret and not read from Infisical — same reason as `DEMO_PASSWORD`.
 * It unlocks only this tenant, which stays off the public surfaces by being
 * a draft.
 */
export const MCP_HARNESS_PASSWORD = 'McpHarness2026!';

export type HarnessRole = 'organizer' | 'speaker' | 'reviewer';

export type HarnessPerson = {
	id: string;
	name: string;
	email: string;
	role: HarnessRole;
};

/** A submitted proposal, authored by one of the harness speakers. */
export type HarnessProposal = {
	key: string;
	speakerId: string;
	title: string;
	abstract: string;
	keyTakeaway: string;
};

export const MCP_HARNESS = {
	orgId: 'org-mcp-harness',
	orgSlug: 'mcp-harness',
	orgName: 'MCP Harness',
	conferenceName: 'MCP Harness',
	conferenceSlug: 'mcp-harness',
	venue: 'Harness Lab',
	startsOn: '2027-10-06',
	endsOn: '2027-10-07',
	people: [
		{
			id: 'user-mcp-avery',
			name: 'Avery Quinn',
			email: `avery@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'organizer'
		},
		{
			id: 'user-mcp-casey',
			name: 'Casey Okonkwo',
			email: `casey@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'speaker'
		},
		{
			id: 'user-mcp-drew',
			name: 'Drew Patel',
			email: `drew@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'speaker'
		},
		{
			id: 'user-mcp-ellis',
			name: 'Ellis Nakamura',
			email: `ellis@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'reviewer'
		},
		{
			id: 'user-mcp-finley',
			name: 'Finley Brooks',
			email: `finley@${MCP_HARNESS_EMAIL_DOMAIN}`,
			role: 'reviewer'
		}
	] as const satisfies readonly HarnessPerson[],
	/**
	 * Proposals somebody else wrote (#340).
	 *
	 * `assign_reviews` refuses a reviewer who is a speaker on the submission, so
	 * an agent holding a single account could never assign itself a review of a
	 * proposal it had just submitted: the guard fired every time and the write
	 * path behind it stayed unmeasured. These two belong to Casey and Drew, so
	 * the organizer account can be assigned one without a conflict.
	 */
	proposals: [
		{
			key: 'casey-observability',
			speakerId: 'user-mcp-casey',
			title: 'Observability for agents that call tools',
			abstract:
				'What a trace has to record when the caller is a model: the tool it picked, ' +
				'the arguments it made up, and the answer it got back.',
			keyTakeaway: 'Log the arguments, not just the tool name.'
		},
		{
			key: 'drew-migrations',
			speakerId: 'user-mcp-drew',
			title: 'Migrations nobody has to be awake for',
			abstract:
				'Expand, backfill, contract — and the three checks that tell you which of ' +
				'the three you are actually in.',
			keyTakeaway: 'A migration you cannot roll forward is a deploy you cannot ship.'
		}
	] as const satisfies readonly HarnessProposal[]
};

/** Tenants this playground is forbidden to touch. */
export const FOREIGN_ORG_IDS = ['org-devflow', 'org-ai-engineer-import'] as const;

export type HarnessIds = {
	orgId: string;
	orgSlug: string;
	conferenceSlug: string;
	people: HarnessPerson[];
	proposals: HarnessProposal[];
};

/**
 * Unique copies of the stable identifiers, so a test can seed the same shape
 * without colliding with another file or with a locally-run seed.
 *
 * The email domain stays `@mcpharness.example` either way — the plus-tag is
 * only there so two parallel tenants can exist.
 */
export function harnessIds(suffix = ''): HarnessIds {
	const tag = suffix ? `-${suffix}` : '';
	return {
		orgId: `${MCP_HARNESS.orgId}${tag}`,
		orgSlug: `${MCP_HARNESS.orgSlug}${tag}`,
		conferenceSlug: `${MCP_HARNESS.conferenceSlug}${tag}`,
		people: MCP_HARNESS.people.map((person) => ({
			...person,
			id: `${person.id}${tag}`,
			email: suffix ? person.email.replace('@', `+${suffix}@`) : person.email
		})),
		// `speakerId` carries the same tag as the user it points at, or the two
		// tenants would trade authors.
		proposals: MCP_HARNESS.proposals.map((proposal) => ({
			...proposal,
			speakerId: `${proposal.speakerId}${tag}`
		}))
	};
}

export type SeededHarness = HarnessIds & {
	conferenceId: number;
	organizerId: string;
	speakerIds: string[];
	reviewerIds: string[];
	/** Seeded proposal ids by `HarnessProposal.key`. */
	submissionIds: Record<string, number>;
};

async function insertHarnessPeople(ids: HarnessIds, now: Date): Promise<void> {
	for (const person of ids.people) {
		await db.insert(user).values({
			id: person.id,
			name: person.name,
			email: person.email,
			emailVerified: true,
			role: 'user',
			banned: false,
			createdAt: now,
			updatedAt: now
		});
		await db.insert(member).values({
			id: `member-${person.id}`,
			organizationId: ids.orgId,
			userId: person.id,
			role: person.role === 'organizer' ? 'owner' : 'member',
			createdAt: now
		});
	}
}

/**
 * The proposals Casey and Drew wrote, one speaker profile each.
 *
 * A profile per author rather than one shared row: the conflict guard joins
 * `speaker_profile.user_id`, so a profile pointing at the wrong account would
 * hide the very thing this seed exists to expose. `cfpFormId` stays null —
 * the playground has no call for papers yet, and the column allows it.
 */
async function insertHarnessProposals(
	ids: HarnessIds,
	conferenceId: number,
	now: Date
): Promise<Record<string, number>> {
	const byKey: Record<string, number> = {};

	for (const proposal of ids.proposals) {
		const author = ids.people.find((person) => person.id === proposal.speakerId);
		if (!author) {
			throw new Error(`seedMcpHarness: no harness person for ${proposal.speakerId}`);
		}

		const [profile] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: ids.orgId,
				userId: author.id,
				name: author.name,
				sortName: author.name.split(' ').at(-1) ?? author.name,
				email: author.email
			})
			.returning({ id: speakerProfileTable.id });

		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId,
				title: proposal.title,
				abstract: proposal.abstract,
				keyTakeaway: proposal.keyTakeaway,
				status: 'submitted',
				submittedAt: now
			})
			.returning({ id: submissionTable.id });

		await db.insert(submissionSpeakerTable).values({
			submissionId: submission.id,
			speakerProfileId: profile.id,
			isPrimary: true,
			position: 0
		});

		byKey[proposal.key] = submission.id;
	}

	return byKey;
}

/**
 * Write the playground through the same function the new-conference screen
 * calls. Creation does not take a status — the schema default is `draft`,
 * which is the whole isolation mechanism.
 */
export async function seedMcpHarness(suffix = ''): Promise<SeededHarness> {
	const ids = harnessIds(suffix);
	const now = new Date();

	await db.insert(organization).values({
		id: ids.orgId,
		name: MCP_HARNESS.orgName,
		slug: ids.orgSlug,
		createdAt: now
	});
	await insertHarnessPeople(ids, now);

	const organizerId = ids.people.find((person) => person.role === 'organizer')!.id;
	const created = await createConference(organizerId, {
		name: MCP_HARNESS.conferenceName,
		slug: ids.conferenceSlug,
		startsOn: MCP_HARNESS.startsOn,
		endsOn: MCP_HARNESS.endsOn,
		venue: MCP_HARNESS.venue
	});
	if (!created.ok) {
		throw new Error(`seedMcpHarness: createConference failed (${created.reason})`);
	}

	const submissionIds = await insertHarnessProposals(ids, created.conference.id, now);

	return {
		...ids,
		conferenceId: created.conference.id,
		organizerId,
		speakerIds: ids.people.filter((person) => person.role === 'speaker').map((person) => person.id),
		reviewerIds: ids.people
			.filter((person) => person.role === 'reviewer')
			.map((person) => person.id),
		submissionIds
	};
}

export async function wipeMcpHarness(ids: Pick<HarnessIds, 'orgId' | 'people'>): Promise<void> {
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	for (const person of ids.people) {
		await db.delete(user).where(eq(user.id, person.id));
	}
}
