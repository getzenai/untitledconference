/**
 * Exposing every registry definition does not widen its permissions. A user
 * who only reviews a conference still cannot invoke an organizer-only tool.
 */
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import type { McpContext } from '$lib/server/mcp/context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '$lib/server/mcp/harness';
import type { UIMessage } from 'ai';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMcpTool } from './adapter';
import { handleAssistantChatRequest } from './assistant';
import { createMockChatModel } from './model';
import { assistantChatToolDefinitions } from './tools';

const suffix = `assistant675-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;
let reviewer: McpContext;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	reviewer = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };
	const person = seeded.people.find((candidate) => candidate.id === reviewer.userId)!;
	const seated = await addReviewer(seeded.conferenceId, person.email);
	expect(seated.ok).toBe(true);
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('assistant chat tool authorization', () => {
	it('refuses an organizer-only tool to a reviewer', async () => {
		const tool = assistantChatToolDefinitions(reviewer).find(
			(definition) => definition.name === 'get_submission'
		);
		expect(tool).toBeDefined();

		const result = await runMcpTool(tool!, {
			conferenceSlug: seeded.conferenceSlug,
			submissionId: seeded.submissionIds['casey-observability']
		});

		expect(result.error).toEqual(expect.stringContaining('organize'));
		expect(result).not.toHaveProperty('abstract');
	});
});

describe('assistant chat update_conference through the mock', () => {
	const previousFlag = process.env.FEATURE_INAPP_CHAT;

	beforeAll(() => {
		process.env.FEATURE_INAPP_CHAT = 'true';
	});

	afterAll(() => {
		if (previousFlag === undefined) delete process.env.FEATURE_INAPP_CHAT;
		else process.env.FEATURE_INAPP_CHAT = previousFlag;
	});

	function event(body: { messages: UIMessage[] }) {
		return {
			locals: {
				user: { id: seeded.organizerId },
				session: null,
				organizationId: seeded.orgId
			} as App.Locals,
			request: new Request('http://localhost/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			})
		};
	}

	it('writes the new name without a card', async () => {
		const ask: UIMessage = {
			id: 'u1',
			role: 'user',
			parts: [
				{
					type: 'text',
					text: `Rename the conference ${seeded.conferenceSlug} to Beta Harness`
				}
			]
		};

		const first = await handleAssistantChatRequest(
			event({ messages: [ask] }),
			createMockChatModel()
		);
		expect(first.status).toBe(200);
		const firstBody = await first.text();
		expect(firstBody).toContain('update_conference');
		expect(firstBody).not.toContain('tool-approval-request');

		const [row] = await db
			.select({ name: conferenceTable.name })
			.from(conferenceTable)
			.where(eq(conferenceTable.id, seeded.conferenceId));
		expect(row?.name).toBe('Beta Harness');
	});

	it('holds a decision behind a card and writes nothing', async () => {
		const submissionId = seeded.submissionIds['casey-observability'];
		const res = await handleAssistantChatRequest(
			event({
				messages: [
					{
						id: 'u1',
						role: 'user',
						parts: [{ type: 'text', text: 'Accept the Casey talk' }]
					}
				]
			}),
			createMockChatModel('decide_submissions', {
				conferenceSlug: seeded.conferenceSlug,
				submissionIds: [submissionId],
				decision: 'accepted'
			})
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('decide_submissions');
		expect(body).toContain('tool-approval-request');

		const [row] = await db
			.select({ status: submissionTable.status })
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row?.status).toBe('submitted');
	});
});
