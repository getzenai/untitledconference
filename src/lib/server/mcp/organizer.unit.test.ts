/**
 * The distinction #684 turned on: a guard's deliberate 404 is a refusal the
 * model may repeat to the user; anything else is a failure it must not dress up
 * as one. A bare `catch` here is what made a dropped connection read as "you do
 * not organize that conference" — and the model then told the organizer he had
 * no conferences at all.
 */
import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOrganizer } = vi.hoisted(() => ({ requireOrganizer: vi.fn() }));
vi.mock('$lib/server/conference/access', () => ({ requireOrganizer }));

import type { McpContext } from './context';
import { organizerConference } from './organizer';
import { McpToolError } from './tool-helpers';

const ctx = { userId: 'user-1', organizationId: 'org-1' } as McpContext;

async function rejection(slug: string): Promise<unknown> {
	try {
		await organizerConference(slug, ctx);
	} catch (thrown) {
		return thrown;
	}
	throw new Error('organizerConference resolved, expected it to throw');
}

describe('organizerConference', () => {
	// Braces on purpose: an arrow body would return the mock, and vitest treats
	// the returned mock as the hook's result and calls it.
	beforeEach(() => {
		requireOrganizer.mockReset();
	});

	it('returns the conference the guard resolved', async () => {
		requireOrganizer.mockResolvedValue({ conference: { id: 7, slug: 'devflow' }, via: 'org' });

		await expect(organizerConference('devflow', ctx)).resolves.toEqual({ id: 7, slug: 'devflow' });
	});

	it('turns the guard’s 404 into the refusal the agent reads', async () => {
		requireOrganizer.mockImplementation(async () => {
			throw error(404, 'Conference not found');
		});

		const thrown = await rejection('devflow');
		expect(thrown).toBeInstanceOf(McpToolError);
		expect((thrown as McpToolError).message).toContain('that you organize');
	});

	it('lets a database failure through instead of calling it a refusal', async () => {
		const dbError = new Error('write CONNECTION_ENDED');
		requireOrganizer.mockImplementation(async () => {
			throw dbError;
		});

		expect(await rejection('devflow')).toBe(dbError);
	});
});
