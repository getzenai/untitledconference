/**
 * REST adapter, measured against the isolated harness and the same loaders
 * the MCP tools already use. The route only remaps arguments; a mismatch
 * here means the adapter bypassed the registry.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from './context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from './harness';
import { buildOpenApiDocument } from './openapi';
import { dispatchRest } from './rest';

const suffix = `mcprest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let seeded: SeededHarness;
let organizer: McpContext;
let casey: McpContext;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	casey = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('REST adapter', () => {
	it('lists the harness conference through list_my_conferences', async () => {
		const result = await dispatchRest('GET', '/conferences', organizer, {});
		expect(result.status).toBe(200);
		expect(result.body.conferences).toEqual(
			expect.arrayContaining([expect.objectContaining({ slug: seeded.conferenceSlug })])
		);
	});

	it('does not list that conference to a speaker who only holds a member seat', async () => {
		const result = await dispatchRest('GET', '/conferences', casey, {});
		expect(result.status).toBe(200);
		expect(result.body.conferences).toEqual([]);
	});

	it('opens the call and publishes through the same write tools', async () => {
		const opened = await dispatchRest(
			'POST',
			`/conferences/${seeded.conferenceSlug}/cfp/open`,
			organizer,
			{}
		);
		expect(opened.status).toBe(200);
		const published = await dispatchRest(
			'POST',
			`/conferences/${seeded.conferenceSlug}/publish`,
			organizer,
			{}
		);
		expect(published.status).toBe(200);
		expect(published.body.status).toBe('published');

		const calls = await dispatchRest('GET', '/cfps', casey, {});
		expect(calls.status).toBe(200);
		expect(calls.body.calls).toEqual(
			expect.arrayContaining([expect.objectContaining({ slug: seeded.conferenceSlug })])
		);
	});

	it('files a draft via POST /cfps/:slug/submissions and lists it on /me/proposals', async () => {
		const created = await dispatchRest(
			'POST',
			`/cfps/${seeded.conferenceSlug}/submissions`,
			casey,
			{
				body: { title: 'REST draft', abstract: 'From the adapter.' }
			}
		);
		expect(created.status).toBe(200);
		expect(created.body.status).toBe('draft');

		const mine = await dispatchRest('GET', '/me/proposals', casey, {});
		expect(mine.body.proposals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: created.body.submissionId, status: 'draft' })
			])
		);

		const updated = await dispatchRest(
			'PATCH',
			`/me/proposals/${created.body.submissionId}`,
			casey,
			{
				body: { conferenceSlug: seeded.conferenceSlug, title: 'REST draft, edited' }
			}
		);
		expect(updated.status).toBe(200);

		const withdrawn = await dispatchRest(
			'POST',
			`/me/proposals/${created.body.submissionId}/withdraw`,
			casey,
			{}
		);
		expect(withdrawn.status).toBe(200);
		expect(withdrawn.body.status).toBe('withdrawn');
	});

	it('creates a room through create_room and lists it on GET /rooms', async () => {
		const created = await dispatchRest(
			'POST',
			`/conferences/${seeded.conferenceSlug}/rooms`,
			organizer,
			{
				body: { name: 'REST Stage' }
			}
		);
		expect(created.status).toBe(200);

		const listed = await dispatchRest(
			'GET',
			`/conferences/${seeded.conferenceSlug}/rooms`,
			organizer,
			{}
		);
		expect(listed.status).toBe(200);
		expect(listed.body.rooms).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'REST Stage' })])
		);
	});

	it('refuses a missing required field with 400, not 500', async () => {
		const result = await dispatchRest('POST', '/conferences', organizer, {
			body: { slug: 'no-name-here' }
		});
		expect(result.status).toBe(400);
		expect(result.body.error).toContain('Invalid input');
	});

	it('returns 404 for a path that is not a resource', async () => {
		const result = await dispatchRest('GET', '/tools/list_my_conferences', organizer, {});
		expect(result.status).toBe(404);
	});

	it('returns 405 when the path exists for another method', async () => {
		const result = await dispatchRest('PATCH', '/conferences', organizer, {});
		expect(result.status).toBe(405);
		expect(result.allow).toContain('GET');
	});

	it('publishes every registered REST tool in the OpenAPI document', () => {
		const spec = buildOpenApiDocument('https://example.test') as {
			openapi: string;
			paths: Record<string, Record<string, { operationId?: string }>>;
		};
		expect(spec.openapi).toBe('3.1.0');
		const ids = Object.values(spec.paths).flatMap((path) =>
			Object.values(path).map((op) => op.operationId)
		);
		expect(ids).toEqual(
			expect.arrayContaining([
				'list_my_conferences',
				'create_conference',
				'decide_submissions',
				'submit_proposal',
				'update_proposal',
				'withdraw_proposal',
				'get_agenda',
				'list_rooms',
				'place_talk'
			])
		);
	});
});
