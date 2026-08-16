/**
 * The settings actions must fail with the shared missing-name sentences (#842).
 *
 * Re-inlining the words used to go unnoticed: the page test feeds the error in
 * as a prop and never looks at the action. The MCP tools already have this
 * pair — a source check that a *copy* fails, and a handler check that the
 * wiring returns the constant.
 */
import { MISSING_STRUCTURE_NAME } from '$lib/conference/structure-lines';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireOrganizer = vi.fn();
const addRooms = vi.fn();
const addTracks = vi.fn();
const addFormats = vi.fn();

vi.mock('$lib/server/conference/access', () => ({
	requireOrganizer: (...args: unknown[]) => requireOrganizer(...args)
}));
vi.mock('$lib/server/conference/archive-conference', () => ({
	archiveConference: vi.fn(),
	restoreConference: vi.fn()
}));
vi.mock('$lib/server/conference/cfp-submission', () => ({ callSummary: vi.fn() }));
vi.mock('$lib/server/conference/config', () => ({
	addFormats: (...args: unknown[]) => addFormats(...args),
	addRooms: (...args: unknown[]) => addRooms(...args),
	addTracks: (...args: unknown[]) => addTracks(...args),
	conferenceConfig: vi.fn(),
	removeFormat: vi.fn(),
	removeRoom: vi.fn(),
	removeTrack: vi.fn(),
	renameRoom: vi.fn(),
	renameTrack: vi.fn(),
	updateFormat: vi.fn()
}));
vi.mock('$lib/server/conference/sponsor-tiers', () => ({
	addSponsorTier: vi.fn(),
	removeSponsorTier: vi.fn(),
	sponsorTiers: vi.fn(),
	updateSponsorTier: vi.fn()
}));
vi.mock('$lib/server/conference/task-templates', () => ({
	addTaskTemplate: vi.fn(),
	applyTemplateToAccepted: vi.fn(),
	deleteTaskTemplate: vi.fn(),
	pendingHandouts: vi.fn(),
	taskTemplates: vi.fn(),
	updateTaskTemplate: vi.fn()
}));
vi.mock('$lib/server/conference/update-conference', () => ({ updateConference: vi.fn() }));
vi.mock('$lib/server/conference/visibility', () => ({
	setConferenceListing: vi.fn(),
	setConferenceVisibility: vi.fn()
}));

import { actions } from './+page.server';

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(here, '+page.server.ts'), 'utf8');
const pageSource = readFileSync(join(here, '+page.svelte'), 'utf8');

const EMPTY = { added: [], skipped: [], ids: [] };

function post(action: string, field: string, value: string) {
	const body = new FormData();
	body.append(field, value);
	return {
		request: new Request(`http://localhost/manage/devflow/settings?/${action}`, {
			method: 'POST',
			body
		}),
		params: { slug: 'devflow' },
		locals: { user: { id: 'user-1' } }
	} as never;
}

beforeEach(() => {
	requireOrganizer.mockReset();
	addRooms.mockReset();
	addTracks.mockReset();
	addFormats.mockReset();
	requireOrganizer.mockResolvedValue({ conference: { id: 7 }, via: 'org' });
	addRooms.mockResolvedValue(EMPTY);
	addTracks.mockResolvedValue(EMPTY);
	addFormats.mockResolvedValue(EMPTY);
});

describe('missing structure names', () => {
	it('uses the shared sentences, not a copy of the words', () => {
		expect(serverSource).toContain('MISSING_STRUCTURE_NAME.room');
		expect(serverSource).toContain('MISSING_STRUCTURE_NAME.track');
		expect(serverSource).toContain('MISSING_STRUCTURE_NAME.format');
		expect(pageSource).toContain('MISSING_STRUCTURE_NAME');

		for (const source of [serverSource, pageSource]) {
			expect(source).not.toContain("'Give the room a name.'");
			expect(source).not.toContain("'Give the track a name.'");
			expect(source).not.toContain("'Give the format a name.'");
		}
	});

	it('refuses a blank room with the shared sentence', async () => {
		const result = await actions.addRoom(post('addRoom', 'names', '   '));
		expect(result).toMatchObject({
			status: 400,
			data: { error: MISSING_STRUCTURE_NAME.room, section: 'rooms' }
		});
	});

	it('refuses a blank track with the shared sentence', async () => {
		const result = await actions.addTrack(post('addTrack', 'names', '   '));
		expect(result).toMatchObject({
			status: 400,
			data: { error: MISSING_STRUCTURE_NAME.track, section: 'tracks' }
		});
	});

	it('refuses a blank format with the shared sentence', async () => {
		const result = await actions.addFormat(post('addFormat', 'formats', '   '));
		expect(result).toMatchObject({
			status: 400,
			data: { error: MISSING_STRUCTURE_NAME.format, section: 'formats' }
		});
	});
});
