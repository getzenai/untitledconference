/**
 * A reviewer of conference A must not receive conference B's data through the
 * chat-wired tools. The definitions are the MCP ones; the adapter only
 * changes the wrapper.
 */
import { createConference } from '$lib/server/conference/create-conference';
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import type { McpContext } from '$lib/server/mcp/context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '$lib/server/mcp/harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMcpTool } from './adapter';
import { createMockChatModel } from './model';
import { streamReviewerChat } from './request';
import { reviewerReadToolDefinitions } from './tools';

const suffix = `chat302-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SECRET = 'SECRET_FROM_CONFERENCE_B';

let seeded: SeededHarness;
let ellis: McpContext;
let conferenceBSlug: string;
let conferenceBSubmissionId: number;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	ellis = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };

	const ellisPerson = seeded.people.find((person) => person.id === ellis.userId)!;
	const seated = await addReviewer(seeded.conferenceId, ellisPerson.email);
	expect(seated.ok).toBe(true);

	const other = await createConference(seeded.organizerId, {
		name: 'Other Conference',
		slug: `other-${suffix}`,
		startsOn: '2027-11-01',
		endsOn: '2027-11-02',
		venue: 'Elsewhere'
	});
	if (!other.ok) throw new Error(`createConference B failed: ${other.reason}`);
	conferenceBSlug = other.conference.slug;

	const [row] = await db
		.insert(submissionTable)
		.values({
			conferenceId: other.conference.id,
			title: SECRET,
			abstract: 'An abstract the reviewer of A must never see.',
			status: 'submitted',
			submittedAt: new Date()
		})
		.returning({ id: submissionTable.id });
	conferenceBSubmissionId = row.id;
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('reviewer chat tools', () => {
	it('refuses conference B data to a reviewer who only sits on A', async () => {
		const defs = reviewerReadToolDefinitions(ellis);
		const get = defs.find((tool) => tool.name === 'get_review_assignment');
		expect(get).toBeDefined();

		const result = await runMcpTool(get!, {
			conferenceSlug: conferenceBSlug,
			submissionId: conferenceBSubmissionId
		});

		expect(result.error).toEqual(expect.stringContaining('that you review for'));
		expect(JSON.stringify(result)).not.toContain(SECRET);
		expect(result).not.toMatchObject({ title: SECRET });
	});

	it('lists A when asked, and does not mention B', async () => {
		const defs = reviewerReadToolDefinitions(ellis);
		const list = defs.find((tool) => tool.name === 'list_my_review_assignments');
		expect(list).toBeDefined();

		const result = await runMcpTool(list!, {});
		expect(result.error).toBeUndefined();
		expect(JSON.stringify(result)).not.toContain(SECRET);
		expect(JSON.stringify(result)).not.toContain(conferenceBSlug);
	});

	it('streams a stubbed reply that names the tool and still hides B', async () => {
		const res = await streamReviewerChat({
			ctx: ellis,
			conference: { name: 'MCP Harness', slug: seeded.conferenceSlug },
			messages: [
				{
					id: 'u1',
					role: 'user',
					parts: [{ type: 'text', text: 'What reviews do I still have open?' }]
				}
			],
			model: createMockChatModel()
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('list_my_review_assignments');
		expect(body).not.toContain(SECRET);
		expect(body).not.toContain(conferenceBSlug);
	});
});
