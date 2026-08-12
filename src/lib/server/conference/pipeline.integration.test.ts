/**
 * Speaker sourcing pipeline: enroll, move, notes, history (CRM-07 / CRM-08).
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContact } from './contacts';
import {
	boardByStage,
	enrollContact,
	getPipelineCard,
	listPipelineCards,
	movePipelineCard,
	PIPELINE_STAGES,
	updatePipelineCardNotes
} from './pipeline';

const suffix = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const outsiderId = `outsider-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Pipeline Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'Pipeline Organizer'
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
	// Cards cascade-delete history; profiles cascade-delete cards.
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, outsiderId));
});

describe('pipeline stages (CRM-07)', () => {
	it('exposes an open-to-won/lost lifecycle with at least 5 named stages', () => {
		expect(PIPELINE_STAGES.length).toBeGreaterThanOrEqual(5);
		expect(PIPELINE_STAGES).toContain('confirmed');
		expect(PIPELINE_STAGES).toContain('declined');
	});
});

describe('enroll + move (CRM-07)', () => {
	it('enrolls a contact, moves stages, and keeps the card after moves', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Marcus Okafor',
			email: `marcus-${suffix}@example.com`,
			company: 'Platform Co'
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const enrolled = await enrollContact(organizerId, created.speakerProfileId, {
			stage: 'identified',
			score: 85,
			rationale: 'Strong platform-engineering track record'
		});
		expect(enrolled).toEqual({ ok: true, cardId: expect.any(Number) });
		if (!enrolled.ok) return;

		const afterEnroll = await listPipelineCards(organizerId);
		expect(afterEnroll).toHaveLength(1);
		expect(afterEnroll[0]).toMatchObject({
			name: 'Marcus Okafor',
			stage: 'identified',
			score: 85
		});

		const toContacted = await movePipelineCard(organizerId, enrolled.cardId, 'contacted');
		expect(toContacted).toEqual({ ok: true, cardId: enrolled.cardId });

		const toInterested = await movePipelineCard(organizerId, enrolled.cardId, 'interested');
		expect(toInterested).toEqual({ ok: true, cardId: enrolled.cardId });

		const cards = await listPipelineCards(organizerId);
		expect(cards[0].stage).toBe('interested');

		const board = boardByStage(cards);
		expect(board.interested.map((c) => c.id)).toEqual([enrolled.cardId]);
		expect(board.identified).toEqual([]);
	});

	it('rejects enroll for outsiders and double-enroll', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'Solo',
			email: `solo-${suffix}@example.com`
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		expect(await enrollContact(outsiderId, created.speakerProfileId)).toEqual({
			ok: false,
			reason: 'forbidden'
		});

		const first = await enrollContact(organizerId, created.speakerProfileId);
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await enrollContact(organizerId, created.speakerProfileId);
		expect(second).toEqual({
			ok: false,
			reason: 'already_enrolled',
			cardId: first.cardId
		});
	});
});

describe('card detail notes + history (CRM-08)', () => {
	it('persists notes and timestamped stage transitions across reloads', async () => {
		const created = await createContact(organizerId, organizationId, {
			name: 'History Person',
			email: `hist-${suffix}@example.com`
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const enrolled = await enrollContact(organizerId, created.speakerProfileId, {
			stage: 'researching'
		});
		expect(enrolled.ok).toBe(true);
		if (!enrolled.ok) return;

		await movePipelineCard(organizerId, enrolled.cardId, 'contacted');
		await movePipelineCard(organizerId, enrolled.cardId, 'interested');

		const noted = await updatePipelineCardNotes(
			organizerId,
			enrolled.cardId,
			'Left voicemail 2027-01-15; follow up next week.'
		);
		expect(noted).toEqual({ ok: true, cardId: enrolled.cardId });

		const detail = await getPipelineCard(organizerId, enrolled.cardId);
		expect(detail).toMatchObject({
			notes: 'Left voicemail 2027-01-15; follow up next week.',
			stage: 'interested'
		});
		expect(detail?.history.length).toBeGreaterThanOrEqual(3);

		// Newest first: interested ← contacted ← researching (enroll)
		expect(detail?.history[0]).toMatchObject({
			fromStage: 'contacted',
			toStage: 'interested'
		});
		expect(detail?.history[0].changedAt).toBeInstanceOf(Date);
		expect(detail?.history.some((h) => h.fromStage === null && h.toStage === 'researching')).toBe(
			true
		);

		// Reload path: read again
		const again = await getPipelineCard(organizerId, enrolled.cardId);
		expect(again?.notes).toBe('Left voicemail 2027-01-15; follow up next week.');
		expect(again?.history).toHaveLength(detail!.history.length);
	});
});
