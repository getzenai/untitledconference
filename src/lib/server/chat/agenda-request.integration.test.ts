/**
 * The agenda chat against the isolated harness tenant.
 *
 * What it has to show is not that the model is clever but that the tools it
 * was handed are the organizer's own: the same `organizerConference` refusal
 * for someone who only sits in the organization, and a stream that reaches the
 * real board rather than a fixture.
 */
import { agendaWriteError } from '$lib/components/app/conference/agenda-chat-write';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import type { McpContext } from '$lib/server/mcp/context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '$lib/server/mcp/harness';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMcpTool } from './adapter';
import { createMockChatModel } from './model';
import { streamAgendaChat } from './request';
import { agendaChatToolDefinitions } from './tools';

const suffix = `chatagenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;
let organizer: McpContext;
let speaker: McpContext;
let conferenceName: string;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	speaker = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
	const [row] = await db
		.select({ name: conferenceTable.name })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, seeded.conferenceId))
		.limit(1);
	conferenceName = row.name;
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

function tool(ctx: McpContext, name: string) {
	const def = agendaChatToolDefinitions(ctx).find((row) => row.name === name);
	expect(def, `${name} is not on the agenda surface`).toBeDefined();
	return def!;
}

describe('agenda chat tools', () => {
	it('reads the organizer their own board', async () => {
		const result = await runMcpTool(tool(organizer, 'get_agenda'), {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(result.error).toBeUndefined();
		expect(JSON.stringify(result)).toContain(seeded.conferenceSlug);
	});

	// Being in the organization is not organizing the conference. The chat adds
	// no authorization of its own, so this refusal has to come from the tool.
	it('refuses a speaker who only sits in the organization', async () => {
		const result = await runMcpTool(tool(speaker, 'get_agenda'), {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(result.error).toEqual(expect.stringContaining('that you organize'));
	});

	it('refuses that speaker a write as well', async () => {
		const result = await runMcpTool(tool(speaker, 'move_talk'), {
			conferenceSlug: seeded.conferenceSlug,
			placementId: 1,
			roomId: 1,
			day: '2027-10-06',
			start: '09:00'
		});
		expect(result.error).toEqual(expect.stringContaining('that you organize'));
		// The refused call still reaches the panel as a finished tool part. This
		// is the one place both halves are in the same test: the shape the
		// server produces has to be the shape the panel calls a refusal, or the
		// board gets a green "Moved X" over nothing (#302).
		expect(agendaWriteError(result)).toEqual(expect.stringContaining('that you organize'));
	});

	it('streams a reply that names the tool and carries the real board', async () => {
		const res = await streamAgendaChat({
			ctx: organizer,
			conference: { name: conferenceName, slug: seeded.conferenceSlug },
			messages: [
				{
					id: 'u1',
					role: 'user',
					parts: [{ type: 'text', text: 'What is on the board?' }]
				}
			],
			model: createMockChatModel('get_agenda', { conferenceSlug: seeded.conferenceSlug }),
			focus: { day: '2027-10-06' }
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('get_agenda');
		expect(body).toContain(seeded.conferenceSlug);
	});
});
