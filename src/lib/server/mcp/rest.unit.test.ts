import { describe, expect, it } from 'vitest';
import { allowedMethods, invokeTool, matchRestRoute, REST_ROUTES } from './rest';
import { allTools } from './server';

const ctx = { userId: 'user-1', organizationId: 'org-1' };

describe('the REST route table', () => {
	it('names only tools that exist in the registry', () => {
		const names = new Set(allTools(ctx).map((tool) => tool.name));
		for (const route of REST_ROUTES) {
			expect(names.has(route.tool), route.tool).toBe(true);
		}
	});

	it('maps the resource paths the issue names onto the same tools', () => {
		expect(matchRestRoute('GET', '/conferences')?.route.tool).toBe('list_my_conferences');
		expect(matchRestRoute('GET', '/conferences/harness/submissions')?.route.tool).toBe(
			'list_submissions'
		);
		expect(matchRestRoute('POST', '/conferences/harness/submissions/decisions')?.route.tool).toBe(
			'decide_submissions'
		);
		expect(matchRestRoute('GET', '/conferences/harness/agenda')?.route.tool).toBe('get_agenda');
	});

	it('answers 405 with Allow when the path exists for another method', () => {
		expect(allowedMethods('/conferences').sort()).toEqual(['GET', 'POST']);
		expect(matchRestRoute('DELETE', '/conferences')).toBeNull();
	});

	it('does not invent an RPC /tools/<name> path', () => {
		expect(matchRestRoute('POST', '/tools/list_my_conferences')).toBeNull();
	});
});

describe('invokeTool', () => {
	it('refuses unknown tools with 404', async () => {
		const result = await invokeTool(ctx, 'not_a_tool', {});
		expect(result).toMatchObject({ ok: false, status: 404 });
	});

	it('turns a zod failure into 400', async () => {
		const result = await invokeTool(ctx, 'create_conference', { name: '' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(400);
		expect(result.body.error).toContain('Invalid input');
	});

	it('coerces a digit string so a path id reaches the number field', async () => {
		const result = await invokeTool(ctx, 'get_submission', {
			conferenceSlug: 'x',
			submissionId: '12'
		});
		// Auth/organizer failure, not "expected number, received string".
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.body.error).not.toContain('expected number');
	});
});
