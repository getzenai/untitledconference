import { allTools } from '$lib/server/mcp/server';
import { describe, expect, it } from 'vitest';
import { toolContext, toolObject, toolPhrase } from './tool-phrase';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

describe('toolPhrase', () => {
	it('turns list/get into a lookup, and a write into a gerund or a past', () => {
		expect(toolPhrase('list_rooms', 'input-available')).toBe('Looking up rooms');
		expect(toolPhrase('list_rooms', 'output-available')).toBe('Rooms');
		expect(toolPhrase('create_room', 'input-available')).toBe('Creating room');
		expect(toolPhrase('create_room', 'output-available')).toBe('Created room');
		expect(toolPhrase('submit_review', 'output-error')).toBe("Couldn't submit review");
		expect(toolPhrase('place_talk', 'output-denied')).toBe('Talk — not done');
	});

	it('produces a phrase for every name in the MCP registry', () => {
		const names = allTools(ctx).map((tool) => tool.name);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const live = toolPhrase(name, 'input-available');
			const done = toolPhrase(name, 'output-available');
			expect(live, name).toEqual(expect.any(String));
			expect(live, name).not.toBe('');
			expect(live, name).not.toMatch(/undefined/i);
			expect(done, name).toEqual(expect.any(String));
			expect(done, name).not.toBe('');
			expect(toolObject(name).length, name).toBeGreaterThan(0);
		}
	});

	it('uses only the verb when the name has no object', () => {
		expect(toolPhrase('refresh', 'input-available')).toBe('Refreshing');
		expect(toolPhrase('refresh', 'output-available')).toBe('Refreshed');
		expect(toolPhrase('refresh', 'output-error')).toBe("Couldn't refresh");
		expect(toolPhrase('refresh', 'output-denied')).toBe('Refresh — not done');
		expect(toolObject('refresh')).toBe('');
	});

	it('uses the irregular past for run, send, find and set', () => {
		expect(toolPhrase('run_check', 'output-available')).toBe('Ran check');
		expect(toolPhrase('send_mail', 'output-available')).toBe('Sent mail');
		expect(toolPhrase('find_talk', 'output-available')).toBe('Found talk');
		expect(toolPhrase('set_status', 'output-available')).toBe('Set status');
	});

	it('picks a name, title or id from the arguments', () => {
		expect(toolContext({ name: 'Hall 1' })).toBe('Hall 1');
		expect(toolContext({ title: 'Keynote' })).toBe('Keynote');
		expect(toolContext({ conferenceSlug: 'devflow' })).toBe('devflow');
		expect(toolContext({ id: 29 })).toBe('29');
		expect(toolContext({ other: 'x' })).toBeNull();
		expect(toolContext(undefined)).toBeNull();
	});
});
