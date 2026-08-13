import { describe, expect, it } from 'vitest';
import { allTools, SERVER_INSTRUCTIONS } from './server';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

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

	it('tells the model about the write tools before it picks one', () => {
		for (const name of [
			'create_conference',
			'open_cfp',
			'publish_conference',
			'invite_reviewer',
			'assign_reviews',
			'unpublish_conference'
		]) {
			expect(SERVER_INSTRUCTIONS).toContain(name);
		}
	});
});
