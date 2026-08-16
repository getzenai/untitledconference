/**
 * Twin of `organizer.unit.test.ts`. The live symptom was on the organizer
 * side; the same catch would tell a reviewer their assignment does not exist
 * when the query actually failed.
 */
import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireReviewer } = vi.hoisted(() => ({ requireReviewer: vi.fn() }));
vi.mock('$lib/server/conference/reviewer', () => ({ requireReviewer }));

import type { McpContext } from './context';
import { reviewerConference } from './reviewer';
import { McpToolError } from './tool-helpers';

const ctx = { userId: 'user-1', organizationId: 'org-1' } as McpContext;

async function rejection(slug: string): Promise<unknown> {
	try {
		await reviewerConference(slug, ctx);
	} catch (thrown) {
		return thrown;
	}
	throw new Error('reviewerConference resolved, expected it to throw');
}

describe('reviewerConference', () => {
	// Braces on purpose: an arrow body would return the mock, and vitest treats
	// the returned mock as the hook's result and calls it.
	beforeEach(() => {
		requireReviewer.mockReset();
	});

	it('returns the conference the guard resolved', async () => {
		const resolved = { conference: { id: 7, slug: 'devflow' }, roundIds: [3] };
		requireReviewer.mockResolvedValue(resolved);

		await expect(reviewerConference('devflow', ctx)).resolves.toEqual(resolved);
	});

	it('turns the guard’s 404 into the refusal the agent reads', async () => {
		requireReviewer.mockImplementation(async () => {
			throw error(404, 'Conference not found');
		});

		const thrown = await rejection('devflow');
		expect(thrown).toBeInstanceOf(McpToolError);
		expect((thrown as McpToolError).message).toContain('that you review for');
	});

	it('lets a database failure through instead of calling it a refusal', async () => {
		const dbError = new Error('write CONNECTION_ENDED');
		requireReviewer.mockImplementation(async () => {
			throw dbError;
		});

		expect(await rejection('devflow')).toBe(dbError);
	});
});
