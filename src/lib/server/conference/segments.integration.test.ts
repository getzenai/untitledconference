/**
 * Saved CRM segments (CRM-09).
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { crmSegmentTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSegment, deleteSegment, listSegments, segmentHref } from './segments';

const suffix = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const outsiderId = `outsider-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Segment Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'Seg Organizer'
		},
		{
			id: outsiderId,
			email: `${outsiderId}@example.test`,
			emailVerified: true,
			name: 'Outsider'
		}
	]);
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});
});

beforeEach(async () => {
	await db.delete(crmSegmentTable).where(eq(crmSegmentTable.organizationId, organizationId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, outsiderId));
});

describe('segments (CRM-09)', () => {
	it('saves a named filter set and reopens via href with members criteria', async () => {
		const saved = await createSegment(organizerId, organizationId, 'AI Experts', {
			tag: 'AI'
		});
		expect(saved).toEqual({ ok: true, segmentId: expect.any(Number) });

		const list = await listSegments(organizerId);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			name: 'AI Experts',
			filters: { tag: 'AI' }
		});
		expect(segmentHref(list[0].filters)).toBe('/contacts?tag=AI');
	});

	it('rejects empty name or empty filters', async () => {
		expect(await createSegment(organizerId, organizationId, '', { company: 'Acme' })).toMatchObject(
			{
				ok: false,
				reason: 'invalid'
			}
		);
		expect(await createSegment(organizerId, organizationId, 'All', {})).toMatchObject({
			ok: false,
			reason: 'invalid'
		});
	});

	it('forbids outsiders and supports delete', async () => {
		expect(await createSegment(outsiderId, organizationId, 'Nope', { company: 'Acme' })).toEqual({
			ok: false,
			reason: 'forbidden'
		});

		const saved = await createSegment(organizerId, organizationId, 'Temp', {
			company: 'Acme'
		});
		expect(saved.ok).toBe(true);
		if (!saved.ok) return;

		expect(await deleteSegment(organizerId, saved.segmentId)).toEqual({
			ok: true,
			segmentId: saved.segmentId
		});
		expect(await listSegments(organizerId)).toEqual([]);
	});
});
