/**
 * Who the edit URL says no to, and how (#496).
 *
 * The loader used to answer one 404 to three different refusals — no such
 * proposal, not yours, already decided — and the third one is the speaker's own
 * accepted talk. They typed the address because acceptance is the moment they
 * care most about the words; the app threw them out of the portal with a page
 * whose heading ("That page is not here") argued with its own body ("This
 * proposal cannot be edited").
 *
 * Two of the three still collapse into one 404, on purpose: a stranger must not
 * learn from the answer whether the proposal exists. That is what the last case
 * here holds in place.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load } from './+page.server';

const suffix = `edit-refusal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerUserId = `speaker-${suffix}`;
const strangerUserId = `stranger-${suffix}`;

let conferenceId = 0;
let acceptedId = 0;
let inReviewId = 0;
let someoneElsesId = 0;

/** What the form needs from the loader when it does open. */
type OpenForm = { submissionId: number; status: string; draft: { title: string } };

/** A redirect or an error, as SvelteKit hands it over: by throwing it. */
type Refusal = { status: number; location?: string; body?: { message: string } };

type SubmissionStatus = typeof submissionTable.$inferInsert.status;

/** The load event the route sees, minus everything this loader does not read. */
const visit = async (id: number, userId: string | null): Promise<OpenForm> =>
	(await load({
		params: { id: String(id) },
		locals: userId ? { user: { id: userId } } : {}
	} as unknown as Parameters<typeof load>[0])) as OpenForm;

/** The same visit, for the cases where opening the form is the failure. */
async function refusalFrom(id: number, userId: string | null): Promise<Refusal> {
	try {
		await visit(id, userId);
	} catch (thrown) {
		return thrown as Refusal;
	}
	throw new Error(`expected the loader to refuse proposal ${id}, but it opened the form`);
}

async function proposal(
	profileId: number | null,
	status: SubmissionStatus,
	title: string
): Promise<number> {
	const [row] = await db
		.insert(submissionTable)
		.values({ conferenceId, title, status })
		.returning({ id: submissionTable.id });

	if (profileId !== null) {
		await db
			.insert(submissionSpeakerTable)
			.values({ submissionId: row.id, speakerProfileId: profileId, isPrimary: true, position: 0 });
	}

	return row.id;
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Edit Refusal Org',
		slug: organizationId,
		createdAt: new Date()
	});

	for (const id of [speakerUserId, strangerUserId]) {
		await db
			.insert(user)
			.values({ id, email: `${id}@example.test`, emailVerified: true, name: 'Priya Raman' });
	}

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Edit Refusal Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	// The call has to be genuinely open, or every case below would redirect for
	// the other reason the loader already had.
	await db.insert(cfpFormTable).values({ conferenceId, title: 'Proposals', status: 'published' });

	const [profile] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: speakerUserId,
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: `${speakerUserId}@example.test`
		})
		.returning({ id: speakerProfileTable.id });

	acceptedId = await proposal(profile.id, 'accepted', 'Build systems without the wait');
	inReviewId = await proposal(profile.id, 'in_review', 'Queues are product decisions');
	someoneElsesId = await proposal(null, 'submitted', 'Not this speaker at all');
});

afterAll(async () => {
	await db
		.delete(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.submissionId, acceptedId));
	await db
		.delete(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.submissionId, inReviewId));
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conferenceId));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
	await db.delete(cfpFormTable).where(eq(cfpFormTable.conferenceId, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(user).where(eq(user.id, speakerUserId));
	await db.delete(user).where(eq(user.id, strangerUserId));
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('the edit URL for a proposal that cannot be edited', () => {
	it('sends the speaker to their own accepted talk instead of out of the portal', async () => {
		const refusal = await refusalFrom(acceptedId, speakerUserId);

		// SvelteKit throws redirects, so the answer arrives as the thrown value.
		expect(refusal).toMatchObject({ status: 303, location: `/portal/submissions/${acceptedId}` });
	});

	it('still opens the form for a proposal that has not been decided', async () => {
		const data = await visit(inReviewId, speakerUserId);

		expect(data.submissionId).toBe(inReviewId);
		expect(data.status).toBe('in_review');
		expect(data.draft.title).toBe('Queues are product decisions');
	});

	it('tells a stranger nothing except that there is no such proposal', async () => {
		const refusal = await refusalFrom(someoneElsesId, strangerUserId);

		// Same answer, same words, for "not yours" and for an id that never existed:
		// anything else would confirm the proposal is there.
		expect(refusal.status).toBe(404);
		expect(refusal.body?.message).toBe('No such proposal');

		const missing = await refusalFrom(acceptedId + 100_000, strangerUserId);
		expect(missing.status).toBe(404);
		expect(missing.body?.message).toBe('No such proposal');
	});
});
