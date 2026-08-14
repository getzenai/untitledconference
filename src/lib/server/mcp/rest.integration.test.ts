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

	/**
	 * #324. DELETE is a method the adapter did not have before, so this measures
	 * the whole path — the verb reaches a route, the body carries the second slug,
	 * and the tool's own refusal comes back as a status rather than a throw.
	 *
	 * DELETE is deliberately the archive, the reversible step: it is what a REST
	 * caller means by deleting a conference, and the one that cannot cost anything.
	 * Erasing is a POST to `/erase`, because it is not the same operation.
	 */
	it('archives over DELETE, restores, then erases — and refuses to erase what is not archived', async () => {
		const slug = `${suffix}-rest-delete`;
		const created = await dispatchRest('POST', '/conferences', organizer, {
			body: { name: 'Delete me over REST', slug, startsOn: '2027-12-01', endsOn: '2027-12-01' }
		});
		expect(created.status).toBe(200);

		const tooSoon = await dispatchRest('POST', `/conferences/${slug}/erase`, organizer, {
			body: { confirmSlug: slug }
		});
		expect(tooSoon.status).toBe(400);
		expect(String(tooSoon.body.error)).toContain('archive_conference');

		const archived = await dispatchRest('DELETE', `/conferences/${slug}`, organizer, {});
		expect(archived.status).toBe(200);
		expect(archived.body).toMatchObject({ slug, status: 'archived' });

		// Still the organizer's to find, and still restorable, which is the whole
		// difference between this and what DELETE used to do.
		const restored = await dispatchRest('POST', `/conferences/${slug}/restore`, organizer, {});
		expect(restored.status).toBe(200);
		expect(restored.body).toMatchObject({ slug, status: 'draft' });

		await dispatchRest('DELETE', `/conferences/${slug}`, organizer, {});

		const unconfirmed = await dispatchRest('POST', `/conferences/${slug}/erase`, organizer, {
			body: { confirmSlug: `${slug}-oops` }
		});
		expect(unconfirmed.status).toBe(400);

		const stillThere = await dispatchRest('GET', '/conferences', organizer, {});
		expect(stillThere.body.conferences).toEqual(
			expect.arrayContaining([expect.objectContaining({ slug })])
		);

		const deleted = await dispatchRest('POST', `/conferences/${slug}/erase`, organizer, {
			body: { confirmSlug: slug }
		});
		expect(deleted.status).toBe(200);
		expect(deleted.body).toMatchObject({ slug, deleted: true });

		const after = await dispatchRest('GET', '/conferences', organizer, {});
		expect((after.body.conferences as { slug: string }[]).map((row) => row.slug)).not.toContain(
			slug
		);
	});

	/**
	 * The confirmation the URL must not be able to carry (#369).
	 *
	 * `rest.ts` said in a comment that confirmSlug travels in the body, and the
	 * dispatcher merged `input.query` into every call regardless — so
	 * `?confirmSlug=x` archived a published conference from the address bar, and
	 * the confirmation ended up in access logs, referrers and shell history.
	 *
	 * Asserted through `dispatchRest` rather than against the merge itself: what
	 * matters is that the whole path refuses, not which line does the refusing.
	 */
	it('does not let the query confirm what the body is supposed to', async () => {
		const slug = `${suffix}-rest-query-confirm`;
		await dispatchRest('POST', '/conferences', organizer, {
			body: { name: 'Confirm me properly', slug, startsOn: '2027-12-02', endsOn: '2027-12-02' }
		});
		const published = await dispatchRest('POST', `/conferences/${slug}/publish`, organizer, {});
		expect(published.status).toBe(200);

		const overTheUrl = await dispatchRest('DELETE', `/conferences/${slug}`, organizer, {
			query: { confirmSlug: slug }
		});

		expect(overTheUrl.status).toBe(400);
		expect(String(overTheUrl.body.error)).toContain('confirmSlug');

		// And it is a refusal, not a slow archive: the conference is still served.
		const untouched = await dispatchRest('GET', '/conferences', organizer, {});
		expect(untouched.body.conferences).toEqual(
			expect.arrayContaining([expect.objectContaining({ slug, status: 'published' })])
		);
	});

	/**
	 * The way out that closing the query would otherwise have taken away: a
	 * `DELETE` body is the one part of a request clients and proxies drop, and
	 * with the query shut there would be no way left to archive a published
	 * conference over REST. So the confirmation gets a named step of its own.
	 */
	it('archives a published conference over POST /archive, confirmation in the body', async () => {
		const slug = `${suffix}-rest-archive-post`;
		await dispatchRest('POST', '/conferences', organizer, {
			body: { name: 'Archive me by name', slug, startsOn: '2027-12-03', endsOn: '2027-12-03' }
		});
		await dispatchRest('POST', `/conferences/${slug}/publish`, organizer, {});

		const withoutConfirmation = await dispatchRest(
			'POST',
			`/conferences/${slug}/archive`,
			organizer,
			{}
		);
		expect(withoutConfirmation.status).toBe(400);

		const archived = await dispatchRest('POST', `/conferences/${slug}/archive`, organizer, {
			body: { confirmSlug: slug }
		});

		expect(archived.status).toBe(200);
		expect(archived.body).toMatchObject({ slug, status: 'archived' });
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
				'get_conference',
				'create_conference',
				'decide_submissions',
				'notify_speakers',
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
