/**
 * A signed-in speaker with a profile at this organizer must not meet a blank
 * About-you section (#558). The public call never used to load a profile, so
 * someone who had already spoken three times typed name, bio and email again.
 *
 * The write-back scope ("this talk" vs "everywhere") and merging a second
 * profile are a different ticket — this file only pins the prefill.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { cfpFormTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { beforeAll, describe, expect, it } from 'vitest';
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
