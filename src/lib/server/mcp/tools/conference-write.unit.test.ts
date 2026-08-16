/**
 * create_track and create_session_format must throw the same missing-name
 * sentence the settings form uses (#774). The handler is the MCP boundary.
 */
import { MISSING_STRUCTURE_NAME } from '$lib/conference/structure-lines';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { organizerConference } = vi.hoisted(() => ({
	organizerConference: vi.fn()
}));

vi.mock('../organizer', () => ({ organizerConference }));
vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('$lib/server/db/auth-schema', () => ({ user: {} }));
vi.mock('$lib/server/db/conference/review-schema', () => ({
	evaluationPlanTable: {},
	reviewRoundTable: {},
	reviewTable: {}
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), count: vi.fn(), eq: vi.fn(), inArray: vi.fn() }));
vi.mock('$lib/server/conference/archive-conference', () => ({
	archiveConference: vi.fn(),
	restoreConference: vi.fn()
}));
vi.mock('$lib/server/conference/cfp-form', () => ({
	closeCfpForm: vi.fn(),
	createCfpForm: vi.fn(),
	publishCfpForm: vi.fn()
}));
vi.mock('$lib/server/conference/config', () => ({
	addFormat: vi.fn(),
	addTrack: vi.fn(),
	conferenceConfig: vi.fn()
}));
vi.mock('$lib/server/conference/create-conference', () => ({ createConference: vi.fn() }));
vi.mock('$lib/server/conference/decision-notifications', () => ({
	notifySubmissionDecisions: vi.fn()
}));
vi.mock('$lib/server/conference/delete-conference', () => ({ deleteConference: vi.fn() }));
vi.mock('$lib/server/conference/review-management', () => ({
	assignReviewerToSubmissions: vi.fn()
}));
vi.mock('$lib/server/conference/review-rounds', () => ({
	addReviewRound: vi.fn(),
	reviewRounds: vi.fn()
}));
vi.mock('$lib/server/conference/reviewer-roster', () => ({
	addReviewer: vi.fn(),
	committee: vi.fn(),
	pendingReviewerInvitations: vi.fn(),
	removeReviewer: vi.fn()
}));
vi.mock('$lib/server/conference/update-conference', () => ({ updateConference: vi.fn() }));
vi.mock('$lib/server/conference/visibility', () => ({ setConferenceVisibility: vi.fn() }));

import type { McpContext } from '../context';
import { McpToolError } from '../tool-helpers';
import { conferenceWriteTools } from './conference-write';

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'conference-write.ts'),
	'utf8'
);

const ctx: McpContext = { userId: 'user-1', organizationId: 'org-1' };
const conference = { id: 7, slug: 'devflow', name: 'DevFlow' };

function tool(name: string) {
	const found = conferenceWriteTools(ctx).find((entry) => entry.name === name);
	if (!found) throw new Error(`missing tool ${name}`);
	return found;
}

async function reject(name: string, args: Record<string, unknown>): Promise<McpToolError> {
	try {
		await tool(name).handler(args);
	} catch (error) {
		if (error instanceof McpToolError) return error;
		throw error;
	}
	throw new Error(`${name} resolved, expected it to throw`);
}

beforeEach(() => {
	organizerConference.mockReset();
	organizerConference.mockResolvedValue(conference);
});

describe('missing structure names', () => {
	it('uses the shared sentences, not a copy of the words', () => {
		expect(source).toContain('MISSING_STRUCTURE_NAME.track');
		expect(source).toContain('MISSING_STRUCTURE_NAME.format');
		expect(source).not.toContain("'Give the track a name.'");
		expect(source).not.toContain("'Give the format a name.'");
	});

	it('refuses a blank track with the settings sentence', async () => {
		const error = await reject('create_track', { conferenceSlug: 'devflow', name: '   ' });
		expect(error.message).toBe(MISSING_STRUCTURE_NAME.track);
	});

	it('refuses a blank format with the settings sentence', async () => {
		const error = await reject('create_session_format', {
			conferenceSlug: 'devflow',
			name: '   '
		});
		expect(error.message).toBe(MISSING_STRUCTURE_NAME.format);
	});
});
