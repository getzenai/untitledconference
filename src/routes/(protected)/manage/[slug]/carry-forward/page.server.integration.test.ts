/**
 * The invite button on the lane, through the door an organizer actually uses.
 *
 * The domain suite already covers persistence and the two refusals. What is
 * only true here is the wiring: a POST with `submissionId` reaches the
 * write, and a second load still shows the answer.
 */
import { setConferencePredecessor } from '$lib/server/conference/predecessor';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const suffix = `cf-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const currentSlug = `now-${suffix}`;

let previous: Conference;
let current: Conference;
let declinedId = 0;

function event(action: 'invite' | 'discard', submissionId: number) {
	const body = new FormData();
	body.append('submissionId', String(submissionId));

	return {
		request: new Request(`http://localhost/manage/${currentSlug}/carry-forward?/${action}`, {
			method: 'POST',
			body
		}),
		params: { slug: currentSlug },
		locals: { user: { id: organizerId } }
	} as unknown as Parameters<(typeof actions)[typeof action]>[0];
}

function loadEvent() {
	return {
		params: { slug: currentSlug },
		locals: { user: { id: organizerId } }
	} as unknown as Parameters<typeof load>[0];
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Carry Page Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: organizerId,
		email: `${organizerId}@example.test`,
		emailVerified: true,
		name: 'An Organizer'
	});
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	[previous] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Then', slug: `then-${suffix}` })
		.returning();
	[current] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Now', slug: currentSlug })
		.returning();
	await setConferencePredecessor(current.id, previous.id);

	const [declined] = await db
		.insert(submissionTable)
		.values({ conferenceId: previous.id, title: 'The near miss', status: 'rejected' })
		.returning();
	declinedId = declined.id;
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.organizationId, organizationId));
	await db.delete(member).where(eq(member.userId, organizerId));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
});

describe('?/invite', () => {
	it('writes the invite so a second load still shows it', async () => {
		expect(await actions.invite(event('invite', declinedId))).toEqual({
			disposition: 'invited',
			submissionId: declinedId
		});

		const data = await load(loadEvent());
		if (!data) throw new Error('the load produced no data for the page');
		expect(data.lane.predecessor?.id).toBe(previous.id);
		expect(data.lane.rows).toEqual([
			expect.objectContaining({
				submissionId: declinedId,
				title: 'The near miss',
				disposition: 'invited'
			})
		]);
	});
});
