/**
 * Exposing every registry definition does not widen its permissions. A user
 * who only reviews a conference still cannot invoke an organizer-only tool.
 */
import { addReviewer } from '$lib/server/conference/reviewer-roster';
import type { McpContext } from '$lib/server/mcp/context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '$lib/server/mcp/harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMcpTool } from './adapter';
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
