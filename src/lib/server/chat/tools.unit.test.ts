/**
 * A surface is defined by what it cannot call. Listing definitions touches no
 * database — the handlers do — so the shape of each list is a unit question.
 */
import type { McpContext } from '$lib/server/mcp/context';
import { describe, expect, it } from 'vitest';
import {
	AGENDA_CHAT_TOOL_NAMES,
	agendaChatToolDefinitions,
	bindReviewerFocus,
	reviewerChatToolDefinitions
} from './tools';

const organizer: McpContext = { userId: 'organizer-1', organizationId: 'org-1' };

describe('agendaChatToolDefinitions', () => {
	it('offers the board reads and the four placement writes', () => {
		const names = agendaChatToolDefinitions(organizer).map((tool) => tool.name);
		expect(names.sort()).toEqual([...AGENDA_CHAT_TOOL_NAMES].sort());
	});

	// The organizer who opened the board to move a talk did not open it to
	// reject one, publish the conference, or mail a speaker. Every extra tool is
	// a sentence the model can misread into a write nobody asked for.
	it('withholds the organizer writes that are not scheduling', () => {
		const names = agendaChatToolDefinitions(organizer).map((tool) => tool.name);
		for (const forbidden of [
			'decide_submissions',
			'publish_conference',
			'notify_speakers',
			'delete_conference',
			'create_room',
			'submit_review'
		]) {
			expect(names).not.toContain(forbidden);
		}
	});

	it('shares no tool with the reviewer surface', () => {
		const agenda = new Set(agendaChatToolDefinitions(organizer).map((tool) => tool.name));
		const reviewer = reviewerChatToolDefinitions(organizer).map((tool) => tool.name);
		expect(reviewer.filter((name) => agenda.has(name))).toEqual([]);
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
