/**
 * What the conference tools let a caller reach.
 *
 * The tools are registered on an MCP server rather than exported as functions,
 * so these drive them the way the protocol does: register against a fake server
 * that captures the handlers, then call one.
 *
 * The case that matters most is the third one. `ctx.organizationId` is the
 * caller's default membership at *any* role, so an implementation that scoped by
 * it would hand a plain member — a reviewer, say — every abstract and review
 * comment in the organization. Organizer rights are narrower than organization
 * membership, and that gap is what this file pins.
 */
import { slotInstant } from '$lib/server/conference/agenda';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { registerConferenceTools } from './conference';

const suffix = `mcptools-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userIds: string[] = [];
const orgIds: string[] = [];
const conferenceIds: number[] = [];

/** Captures what `registerConferenceTools` registers, so a test can call one. */
type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	const fakeServer = {
		registerTool(name: string, _config: unknown, callback: Handler) {
			handlers.set(name, callback);
		}
	};
	registerConferenceTools(fakeServer as never, ctx);
	return handlers;
}

/** The tool result is a CallToolResult; unwrap the JSON the helper serialized. */
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

async function seedUser(key: string): Promise<string> {
	const id = `user-${key}-${suffix}`;
	await db.insert(user).values({
		id,
		email: `${id}@example.test`,
		emailVerified: false,
		role: 'user',
		banned: false,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	userIds.push(id);
	return id;
}

async function seedOrg(key: string, userId: string, role: string): Promise<string> {
	const orgId = `org-${key}-${suffix}`;
	await db
		.insert(organization)
		.values({ id: orgId, name: `Org ${key}`, slug: orgId, createdAt: new Date() });
	orgIds.push(orgId);
	await db.insert(member).values({
		id: `member-${key}-${suffix}`,
		organizationId: orgId,
		userId,
		role,
		createdAt: new Date()
	});
	return orgId;
}

async function seedConference(key: string, organizationId: string): Promise<{ slug: string }> {
	const slug = `conf-${key}-${suffix}`;
	const [row] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: `Conference ${key}`,
			slug,
			startsOn: '2027-06-01',
			endsOn: '2027-06-02',
			status: 'draft'
		})
		.returning({ id: conferenceTable.id });
	conferenceIds.push(row.id);

	await db.insert(submissionTable).values({
		conferenceId: row.id,
		title: `Secret proposal of ${key}`,
		abstract: 'Not for other tenants.',
		status: 'submitted'
	});
	return { slug };
}

let ownerCtx: McpContext;
let plainMemberCtx: McpContext;
let ownConference: { slug: string };
let otherConference: { slug: string };

beforeAll(async () => {
	// One organization the caller owns, one they merely belong to.
	const ownerId = await seedUser('owner');
	const ownOrg = await seedOrg('own', ownerId, 'owner');
	ownConference = await seedConference('own', ownOrg);
	ownerCtx = { userId: ownerId, organizationId: ownOrg };

	// A second user holding a plain `member` seat in an organization that has a
	// conference. Organization membership, but no organizer right anywhere.
	const memberId = await seedUser('plain');
	const otherOrg = await seedOrg('other', memberId, 'member');
	otherConference = await seedConference('other', otherOrg);
	plainMemberCtx = { userId: memberId, organizationId: otherOrg };
});

afterAll(async () => {
	for (const id of conferenceIds)
		await db.delete(conferenceTable).where(eq(conferenceTable.id, id));
	for (const id of userIds) await db.delete(user).where(eq(user.id, id));
	for (const id of orgIds) await db.delete(organization).where(eq(organization.id, id));
});

describe('the conference MCP tools', () => {
	it('lists the conferences the caller organizes', async () => {
		const { data } = await call(ownerCtx, 'list_my_conferences');

		const slugs = (data!.conferences as { slug: string }[]).map((c) => c.slug);
		expect(slugs).toContain(ownConference.slug);
		expect(slugs).not.toContain(otherConference.slug);
	});

	it('returns the proposals of a conference the caller organizes', async () => {
		const { data } = await call(ownerCtx, 'list_submissions', {
			conferenceSlug: ownConference.slug,
			limit: 100
		});

		expect(data!.count).toBe(1);
		expect((data!.submissions as { title: string }[])[0].title).toContain('Secret proposal of own');
	});

	it('refuses a conference the caller belongs to but does not organize', async () => {
		// The whole point: `plainMemberCtx.organizationId` IS the organization that
		// owns `otherConference`. A tool scoped by organization would answer this.
		expect(plainMemberCtx.organizationId).toBe(
			(
				await db
					.select({ organizationId: conferenceTable.organizationId })
					.from(conferenceTable)
					.where(eq(conferenceTable.slug, otherConference.slug))
					.limit(1)
			)[0].organizationId
		);

		const result = await call(plainMemberCtx, 'list_submissions', {
			conferenceSlug: otherConference.slug,
			limit: 100
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain('that you organize');
	});

	it('refuses another organization conference without revealing that it exists', async () => {
		const missing = await call(ownerCtx, 'list_submissions', {
			conferenceSlug: `definitely-not-a-conference-${suffix}`,
			limit: 100
		});
		const foreign = await call(ownerCtx, 'list_submissions', {
			conferenceSlug: otherConference.slug,
			limit: 100
		});

		expect(missing.isError).toBe(true);
		expect(foreign.isError).toBe(true);
		// Same shape of answer for "does not exist" and "not yours", or the id
		// space becomes enumerable.
		expect(foreign.text.replace(otherConference.slug, 'X')).toBe(
			missing.text.replace(`definitely-not-a-conference-${suffix}`, 'X')
		);
	});

	it('decides through the real decision path, not a status column', async () => {
		const list = await call(ownerCtx, 'list_submissions', {
			conferenceSlug: ownConference.slug,
			limit: 100
		});
		const submissionId = (list.data!.submissions as { id: number }[])[0].id;

		const { data } = await call(ownerCtx, 'decide_submissions', {
			conferenceSlug: ownConference.slug,
			submissionIds: [submissionId],
			decision: 'accepted'
		});

		expect(data!.decided).toBe(1);
		// The tell that `decideSubmissions` ran rather than an UPDATE: accepting
		// also opens the agenda slot. A tool that wrote `status` itself would
		// report a decision and leave the programme without the talk.
		expect(data!.sessionsCreated).toBe(1);

		const [row] = await db
			.select({ status: submissionTable.status, decidedAt: submissionTable.decidedAt })
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId))
			.limit(1);
		expect(row.status).toBe('accepted');
		expect(row.decidedAt).not.toBeNull();

		// Deciding the same way twice must not decide again or duplicate the slot.
		const again = await call(ownerCtx, 'decide_submissions', {
			conferenceSlug: ownConference.slug,
			submissionIds: [submissionId],
			decision: 'accepted'
		});
		expect(again.data!.decided).toBe(0);
		expect(again.data!.unchanged).toBe(1);
		expect(again.data!.sessionsCreated).toBe(0);
	});

	it('cannot decide a submission belonging to another conference', async () => {
		const [foreign] = await db
			.select({ id: submissionTable.id, status: submissionTable.status })
			.from(submissionTable)
			.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
			.where(eq(conferenceTable.slug, otherConference.slug))
			.limit(1);

		// Named alongside a conference the caller really does organize — the shape
		// of the attempt that a per-row scope has to stop.
		const { data } = await call(ownerCtx, 'decide_submissions', {
			conferenceSlug: ownConference.slug,
			submissionIds: [foreign.id],
			decision: 'rejected'
		});

		expect(data!.decided).toBe(0);
		expect(data!.notDecided).toBe(1);

		const [after] = await db
			.select({ status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, foreign.id))
			.limit(1);
		expect(after.status).toBe(foreign.status);
	});

	/**
	 * A draft is the speaker's own unfinished form. Deciding one made a row the UI
	 * cannot produce — `accepted` with `submittedAt: null` — and the talk then sat in
	 * the agenda tray, placeable, with nobody having handed it in (#321).
	 */
	it('leaves a never-submitted draft undecided and names it in the counts', async () => {
		const [conf] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, ownConference.slug))
			.limit(1);
		const [draft] = await db
			.insert(submissionTable)
			.values({ conferenceId: conf.id, title: 'Never handed in', status: 'draft' })
			.returning({ id: submissionTable.id });

		const { data } = await call(ownerCtx, 'decide_submissions', {
			conferenceSlug: ownConference.slug,
			submissionIds: [draft.id],
			decision: 'accepted'
		});

		expect(data!.decided).toBe(0);
		expect(data!.skippedDrafts).toBe(1);
		expect(data!.sessionsCreated).toBe(0);
		// The skipped draft is accounted for by name, not swept into the leftover.
		expect(data!.notDecided).toBe(0);

		const [after] = await db
			.select({
				status: submissionTable.status,
				submittedAt: submissionTable.submittedAt,
				decidedAt: submissionTable.decidedAt
			})
			.from(submissionTable)
			.where(eq(submissionTable.id, draft.id))
			.limit(1);
		expect(after.status).toBe('draft');
		expect(after.submittedAt).toBeNull();
		expect(after.decidedAt).toBeNull();

		// The conference is shared with the tests below, which take the first row of
		// list_submissions. Leaving the draft behind would move that row under them.
		await db.delete(submissionTable).where(eq(submissionTable.id, draft.id));
	});

	/**
	 * The stored timestamp is the conference's wall clock parked in UTC, so
	 * `toISOString()` handed out a `Z` it never earned: 14:00 in the room came back
	 * as 14:00Z, an hour off for any client that parses it honestly (#325).
	 */
	it('returns agenda times as the conference clock, with no timezone to misread', async () => {
		const [conf] = await db
			.select({ id: conferenceTable.id })
			.from(conferenceTable)
			.where(eq(conferenceTable.slug, ownConference.slug))
			.limit(1);
		const [day] = await db
			.insert(conferenceDayTable)
			.values({ conferenceId: conf.id, date: '2027-06-01' })
			.returning({ id: conferenceDayTable.id });
		const [room] = await db
			.insert(roomTable)
			.values({ conferenceId: conf.id, name: 'Testhalle' })
			.returning({ id: roomTable.id });
		await db.insert(placementTable).values({
			conferenceId: conf.id,
			kind: 'block',
			title: 'Coffee',
			conferenceDayId: day.id,
			roomId: room.id,
			startsAt: slotInstant('2027-06-01', 14 * 60),
			endsAt: slotInstant('2027-06-01', 14 * 60 + 30)
		});

		const { text, data } = await call(ownerCtx, 'get_agenda', {
			conferenceSlug: ownConference.slug
		});

		const placements = data!.placements as Record<string, unknown>[];
		const coffee = placements.find((p) => p.title === 'Coffee')!;
		expect(coffee).toMatchObject({
			day: '2027-06-01',
			room: 'Testhalle',
			start: '14:00',
			startMinutes: 840,
			end: '14:30',
			endMinutes: 870
		});
		// The old shape is gone rather than merely accompanied: a client that still
		// reads `startsAt` would keep being an hour out and never learn why.
		expect(coffee).not.toHaveProperty('startsAt');
		expect(text).not.toContain('Z"');
	});

	it('does not return reviewer identities with a proposal', async () => {
		const list = await call(ownerCtx, 'list_submissions', {
			conferenceSlug: ownConference.slug,
			limit: 100
		});
		const submissionId = (list.data!.submissions as { id: number }[])[0].id;

		const { text, data } = await call(ownerCtx, 'get_submission', {
			conferenceSlug: ownConference.slug,
			submissionId
		});

		expect(data!.title).toContain('Secret proposal of own');
		expect(text).not.toContain('reviewerUserId');
	});
});
