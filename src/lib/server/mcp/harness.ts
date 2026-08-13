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
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
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
	] as const satisfies readonly HarnessPerson[]
};

/** Tenants this playground is forbidden to touch. */
export const FOREIGN_ORG_IDS = ['org-devflow', 'org-ai-engineer-import'] as const;

export type HarnessIds = {
	orgId: string;
	orgSlug: string;
	conferenceSlug: string;
	people: HarnessPerson[];
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
		}))
	};
}

export type SeededHarness = HarnessIds & {
	conferenceId: number;
	organizerId: string;
	speakerIds: string[];
	reviewerIds: string[];
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
		endsOn: MCP_HARNESS.endsOn
	});
	if (!created.ok) {
		throw new Error(`seedMcpHarness: createConference failed (${created.reason})`);
	}

	await db
		.update(conferenceTable)
		.set({ venue: MCP_HARNESS.venue })
		.where(eq(conferenceTable.id, created.conference.id));

	return {
		...ids,
		conferenceId: created.conference.id,
		organizerId,
		speakerIds: ids.people.filter((person) => person.role === 'speaker').map((person) => person.id),
		reviewerIds: ids.people
			.filter((person) => person.role === 'reviewer')
			.map((person) => person.id)
	};
}

export async function wipeMcpHarness(ids: Pick<HarnessIds, 'orgId' | 'people'>): Promise<void> {
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	for (const person of ids.people) {
		await db.delete(user).where(eq(user.id, person.id));
	}
}
