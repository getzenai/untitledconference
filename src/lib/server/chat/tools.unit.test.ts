/**
 * What the assistant may call is now the whole registry (#683), so the
 * question this file answers is no longer "which list" but "does the list
 * still equal the registry, and does the page's round still bind". Listing
 * definitions touches no database — the handlers do — so both are unit
 * questions.
 */
import type { McpContext } from '$lib/server/mcp/context';
import { allTools } from '$lib/server/mcp/server';
import { describe, expect, it } from 'vitest';
import {
	assistantChatToolDefinitions,
	assistantChatWriteToolNames,
	bindReviewerFocus
} from './tools';

const organizer: McpContext = { userId: 'organizer-1', organizationId: 'org-1' };

describe('assistantChatToolDefinitions', () => {
	it('offers every tool in the MCP registry', () => {
		const registry = allTools(organizer)
			.map((tool) => tool.name)
			.sort();
		const assistant = assistantChatToolDefinitions(organizer)
			.map((tool) => tool.name)
			.sort();
		expect(assistant).toEqual(registry);
	});

	it('derives its write set from the registry metadata', () => {
		const registryWrites = allTools(organizer)
			.filter((tool) => tool.writes)
			.map((tool) => tool.name)
			.sort();
		expect(assistantChatWriteToolNames(organizer).sort()).toEqual(registryWrites);
		// 30 at #683, plus the six form-builder writes #712 adds, plus fill_schedule.
		expect(registryWrites).toHaveLength(37);
	});
});

describe('bindReviewerFocus', () => {
	const focus = { submissionId: 7, roundId: 3 };

	it('hard-binds both focused review tools to the page round', () => {
		for (const name of ['get_review_assignment', 'submit_review']) {
			expect(bindReviewerFocus(name, { submissionId: 7 }, focus)).toEqual({
				submissionId: 7,
				roundId: 3
			});
			expect(bindReviewerFocus(name, { submissionId: 7, roundId: 99 }, focus)).toEqual({
				submissionId: 7,
				roundId: 3
			});
		}
	});

	it('does not redirect an explicitly named different assignment', () => {
		const input = { submissionId: 8, roundId: 4 };
		expect(bindReviewerFocus('submit_review', input, focus)).toBe(input);
		expect(bindReviewerFocus('list_my_review_assignments', input, focus)).toBe(input);
	});
});
