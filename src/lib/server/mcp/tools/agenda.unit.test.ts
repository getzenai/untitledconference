/**
 * fill_schedule is the wrap the spec names: it calls autoPlace, the same
 * function ?/autoPlace calls, and returns that count as autoPlaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { organizerConference, autoPlace } = vi.hoisted(() => ({
	organizerConference: vi.fn(),
	autoPlace: vi.fn()
}));

vi.mock('../organizer', () => ({ organizerConference }));
vi.mock('$lib/server/conference/agenda', () => ({
	addRoom: vi.fn(),
	agendaBoard: vi.fn(),
	autoPlace,
	createBlock: vi.fn(),
	placeSession: vi.fn(),
	removeBlock: vi.fn(),
	swapPlacements: vi.fn(),
	unplaceSession: vi.fn()
}));

import type { McpContext } from '../context';
import { agendaTools } from './agenda';

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1' };
const conference = { id: 7, slug: 'devflow', name: 'DevFlow' };

function tool(name: string) {
	const found = agendaTools(ctx).find((entry) => entry.name === name);
	if (!found) throw new Error(`missing tool ${name}`);
	return found;
}

beforeEach(() => {
	organizerConference.mockReset();
	autoPlace.mockReset();
	organizerConference.mockResolvedValue(conference);
});

describe('fill_schedule', () => {
	it('is registered as a write', () => {
		expect(tool('fill_schedule').writes).toBe(true);
	});

	it('returns autoPlace as autoPlaced — the same field ?/autoPlace returns', async () => {
		autoPlace.mockResolvedValue(3);

		await expect(tool('fill_schedule').handler({ conferenceSlug: 'devflow' })).resolves.toEqual({
			conference: { slug: 'devflow', name: 'DevFlow' },
			autoPlaced: 3
		});

		expect(autoPlace).toHaveBeenCalledOnce();
		expect(autoPlace).toHaveBeenCalledWith(7);
	});

	it('returns zero when the packer places nothing — leftover is not an error', async () => {
		autoPlace.mockResolvedValue(0);

		await expect(
			tool('fill_schedule').handler({ conferenceSlug: 'devflow' })
		).resolves.toMatchObject({ autoPlaced: 0 });
	});
});
