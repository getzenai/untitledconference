import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allTools, SERVER_INSTRUCTIONS } from './server';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

/** Snake_case identifiers — the shape a model treats as a tool name. */
const TOOL_SHAPED = /\b[a-z]+(?:_[a-z]+)+\b/g;

const JOURNEY_TOOLS = [
	'list_open_cfps',
	'submit_proposal',
	'update_proposal',
	'withdraw_proposal',
	'list_my_proposals',
	'update_my_speaker_profile',
	'list_my_review_assignments',
	'get_review_assignment',
	'submit_review'
] as const;

describe('the MCP tool registry', () => {
	it('lists each tool once — the adapter loops this list, so a duplicate name would collide', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names).toEqual([...new Set(names)]);
	});

	it('exports the organizer write tools #298 adds', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'create_conference',
				'update_conference',
				'open_cfp',
				'close_cfp',
				'publish_conference',
				'unpublish_conference',
				'invite_reviewer',
				'assign_reviews'
			])
		);
	});

	it('exports the speaker and reviewer tools #299 adds', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names).toEqual(expect.arrayContaining([...JOURNEY_TOOLS]));
	});

	it('tells the model about every registered tool before it picks one', () => {
		for (const name of allTools(ctx).map((tool) => tool.name)) {
			expect(SERVER_INSTRUCTIONS).toContain(name);
		}
	});

	it('does not name a tool the registry does not have', () => {
		const names = new Set(allTools(ctx).map((tool) => tool.name));
		const mentioned = SERVER_INSTRUCTIONS.match(TOOL_SHAPED) ?? [];
		expect(mentioned.length).toBeGreaterThan(0);
		for (const name of mentioned) {
			expect(names.has(name), name).toBe(true);
		}
	});

	it('does not advertise a missing tool in the README MCP paragraph either', () => {
		const names = new Set(allTools(ctx).map((tool) => tool.name));
		const readme = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../README.md'),
			'utf8'
		);
		const paragraph = readme.match(/\*\*An MCP server\*\*[^\n]+/)?.[0];
		expect(paragraph).toBeTruthy();
		for (const name of paragraph!.match(TOOL_SHAPED) ?? []) {
			expect(names.has(name), name).toBe(true);
		}
	});
});
