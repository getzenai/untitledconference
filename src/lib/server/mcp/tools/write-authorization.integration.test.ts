/**
 * Who may write what, asked of the tool layer itself (#671).
 *
 * Since #683 the assistant offers every tool in the registry to everyone who
 * is signed in — the per-surface allow-list is gone, and the only fence left
 * is the authorization inside each handler. That fence was never measured as a
 * fence: each tool has its own happy-path test, and a new write tool that
 * forgets `organizerConference` would pass all of them.
 *
 * So this file asks the question the way an attacker would, once per write
 * tool: a reviewer and a speaker of the same conference call it, and it has to
 * refuse. The table is checked against the registry, so the next write tool
 * cannot be added without a row here.
 *
 * A refusal message is not proof that nothing was written — for the two tools
 * that would be worst to get wrong, the conference row is read back afterwards.
 */
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { allTools } from '$lib/server/mcp/server';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '../harness';
import { registerAllTools } from '../server';

const suffix = `mcpwriteauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	registerAllTools(
		{
			registerTool(name: string, _config: unknown, callback: Handler) {
				handlers.set(name, callback);
			}
		} as never,
		ctx
	);
	return handlers;
}

async function call(ctx: McpContext, name: string, args: Record<string, unknown>) {
	const handler = toolsFor(ctx).get(name);
	if (!handler) throw new Error(`tool ${name} was not registered`);
	const result = (await handler(args)) as unknown as {
		isError?: boolean;
		content: { text: string }[];
	};
	return { isError: result.isError ?? false, text: result.content[0].text };
}

let seeded: SeededHarness;
let organizer: McpContext;
let casey: McpContext;
let ellis: McpContext;
let slug: string;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	casey = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
	ellis = { userId: seeded.reviewerIds[0], organizationId: seeded.orgId };
	slug = seeded.conferenceSlug;
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

/**
 * Arguments good enough to get past the schema and reach the handler. They do
 * not have to describe anything real: the authorization check runs before the
 * first lookup, and a test that needed a valid placement id would be proving
 * something about the fixture instead of about the fence.
 */
function organizerWriteArgs(conferenceSlug: string): Record<string, Record<string, unknown>> {
	return {
		update_conference: { conferenceSlug, name: 'Renamed by someone else' },
		open_cfp: { conferenceSlug },
		close_cfp: { conferenceSlug },
		publish_conference: { conferenceSlug },
		unpublish_conference: { conferenceSlug },
		archive_conference: { conferenceSlug, confirmSlug: conferenceSlug },
		restore_conference: { conferenceSlug },
		delete_conference: { conferenceSlug, confirmSlug: conferenceSlug },
		invite_reviewer: { conferenceSlug, email: 'intruder@mcpharness.example' },
		remove_reviewer: { conferenceSlug, email: 'intruder@mcpharness.example' },
		create_review_round: { conferenceSlug, name: 'Round by someone else' },
		assign_reviews: { conferenceSlug, submissionIds: [1], reviewerEmail: 'x@mcpharness.example' },
		create_session_format: { conferenceSlug, name: 'Format by someone else' },
		create_track: { conferenceSlug, name: 'Track by someone else' },
		notify_speakers: { conferenceSlug, submissionIds: [1] },
		decide_submissions: { conferenceSlug, submissionIds: [1], decision: 'accept' },
		create_room: { conferenceSlug, name: 'Room by someone else' },
		place_talk: { conferenceSlug, placementId: 1, roomId: 1, startMinutes: 600 },
		move_talk: { conferenceSlug, placementId: 1, roomId: 1, startMinutes: 600 },
		swap_talks: { conferenceSlug, placementId: 1, withPlacementId: 2 },
		unplace_talk: { conferenceSlug, placementId: 1 },
		create_break: { conferenceSlug, minutes: 30, title: 'Break by someone else' },
		remove_break: { conferenceSlug, placementId: 1 },
		update_cfp_form: { conferenceSlug, title: 'Renamed by someone else' },
		add_cfp_field: { conferenceSlug, label: 'Field by someone else', kind: 'short_text' },
		update_cfp_field: {
			conferenceSlug,
			fieldId: 1,
			label: 'Field by someone else',
			kind: 'short_text'
		},
		delete_cfp_field: { conferenceSlug, fieldId: 1 },
		move_cfp_field: { conferenceSlug, fieldId: 1, direction: 'up' },
		set_cfp_fixed_question: { conferenceSlug, key: 'abstract', shown: false }
	};
}

/**
 * Write tools that are deliberately open to a signed-in user: they write the
 * caller's own proposal, profile or review, and their handlers check ownership
 * rather than an organizer seat. `create_conference` belongs here too — anyone
 * may start one, and the organization it lands in comes from `ctx`, not args.
 */
const SELF_SCOPED_WRITES = [
	'create_conference',
	'submit_proposal',
	'update_proposal',
	'finalize_proposal',
	'withdraw_proposal',
	'update_my_speaker_profile',
	'submit_review'
];

describe('who may write', () => {
	it('has a row for every write tool in the registry', () => {
		const registryWrites = allTools(organizer)
			.filter((tool) => tool.writes)
			.map((tool) => tool.name)
			.sort();
		const covered = [...Object.keys(organizerWriteArgs(slug)), ...SELF_SCOPED_WRITES].sort();
		// Fails when someone adds a write tool: decide which list it belongs in
		// rather than letting it ship unmeasured.
		expect(covered).toEqual(registryWrites);
	});

	const cases = Object.entries(organizerWriteArgs('placeholder')).map(([name]) => name);

	it.each(cases)(
		'refuses %s to a reviewer and to a speaker of the same conference',
		async (name) => {
			const args = organizerWriteArgs(slug)[name];
			for (const [who, ctx] of [
				['reviewer', ellis],
				['speaker', casey]
			] as const) {
				const result = await call(ctx, name, args);
				expect(result.isError, `${name} let the ${who} through`).toBe(true);
				// The refusal has to be the deliberate one. "An unexpected error
				// occurred" is a crash that happens to look safe today, and would stop
				// looking safe the moment the crash moves.
				expect(result.text, `${name} crashed at the ${who} instead of refusing`).not.toContain(
					'An unexpected error occurred'
				);
				expect(result.text, `${name} told the ${who} what exists`).toContain('that you organize');
			}
		}
	);

	it('leaves the conference standing after a reviewer tries to delete and unpublish it', async () => {
		await call(ellis, 'delete_conference', { conferenceSlug: slug, confirmSlug: slug });
		await call(ellis, 'unpublish_conference', { conferenceSlug: slug });

		const [row] = await db
			.select()
			.from(conferenceTable)
			.where(eq(conferenceTable.id, seeded.conferenceId))
			.limit(1);
		expect(row, 'the conference is still there').toBeTruthy();
		expect(row.slug).toBe(slug);
	});
});
