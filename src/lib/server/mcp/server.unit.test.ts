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
				'assign_reviews',
				'create_review_round',
				'list_review_rounds',
				'create_session_format',
				'list_session_formats',
				'create_track',
				'list_tracks'
			])
		);
	});

	it('exports the speaker and reviewer tools #299 adds', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names).toEqual(expect.arrayContaining([...JOURNEY_TOOLS]));
	});

	it('exports the agenda tools #300 adds', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'list_rooms',
				'create_room',
				'get_agenda_tray',
				'place_talk',
				'move_talk',
				'swap_talks',
				'unplace_talk'
			])
		);
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

	// The tool list lives in docs/MCP.md rather than the README, and prose does
	// not compile: nothing but this test stands between the documented list and
	// the registry. It holds both directions, because both ways of drifting hurt
	// a reader — a tool named there that does not exist sends them at nothing, and
	// one missing from there is a capability they never learn they have.
	it('documents exactly the tools the registry has', () => {
		const names = new Set(allTools(ctx).map((tool) => tool.name));
		const doc = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/MCP.md'),
			'utf8'
		);

		const mentioned = new Set(doc.match(TOOL_SHAPED) ?? []);
		for (const name of mentioned) {
			expect(names.has(name), `documented but not registered: ${name}`).toBe(true);
		}
		for (const name of names) {
			expect(mentioned.has(name), `registered but not documented: ${name}`).toBe(true);
		}
	});
});
