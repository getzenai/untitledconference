/**
 * Org-wide speaker sourcing pipeline (CRM-07 / CRM-08).
 *
 * Kanban board above any single event: enroll a directory contact, move between
 * stages (open → confirmed/declined), persist card notes, and keep a timestamped
 * stage history. Access matches the contacts directory (org owner/admin).
 */
import {
	isPipelineStage,
	PIPELINE_STAGES,
	type PipelineStage
} from '$lib/conference/pipeline-stages';
import { db } from '$lib/server/db';
import {
	crmPipelineCardTable,
	crmPipelineStageHistoryTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { organizerOrganizationIds } from './contacts';

export {
	isPipelineStage,
	PIPELINE_STAGE_LABELS,
	PIPELINE_STAGES,
	type PipelineStage
} from '$lib/conference/pipeline-stages';

export type PipelineCard = {
	id: number;
	organizationId: string;
	speakerProfileId: number;
	stage: PipelineStage;
	notes: string | null;
	score: number | null;
	rationale: string | null;
	name: string;
	email: string | null;
	company: string | null;
	jobTitle: string | null;
	updatedAt: Date;
};

export type StageHistoryEntry = {
	id: number;
	fromStage: PipelineStage | null;
	toStage: PipelineStage;
	changedAt: Date;
};

export type PipelineCardDetail = PipelineCard & {
	history: StageHistoryEntry[];
};

export type PipelineWriteResult =
	| { ok: true; cardId: number }
	| { ok: false; reason: 'invalid'; message: string }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'forbidden' }
	| { ok: false; reason: 'already_enrolled'; cardId: number };

function trimOrNull(value: string | null | undefined): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

/** All pipeline cards across orgs the user administers, ordered for the board. */
export async function listPipelineCards(userId: string): Promise<PipelineCard[]> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	const rows = await db
		.select({
			id: crmPipelineCardTable.id,
			organizationId: crmPipelineCardTable.organizationId,
			speakerProfileId: crmPipelineCardTable.speakerProfileId,
			stage: crmPipelineCardTable.stage,
			notes: crmPipelineCardTable.notes,
			score: crmPipelineCardTable.score,
			rationale: crmPipelineCardTable.rationale,
			updatedAt: crmPipelineCardTable.updatedAt,
			name: speakerProfileTable.name,
			email: speakerProfileTable.email,
			company: speakerProfileTable.company,
			jobTitle: speakerProfileTable.jobTitle
		})
		.from(crmPipelineCardTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, crmPipelineCardTable.speakerProfileId)
		)
		.where(inArray(crmPipelineCardTable.organizationId, orgIds))
		.orderBy(asc(crmPipelineCardTable.updatedAt), asc(crmPipelineCardTable.id));

	return rows
		.filter((r) => isPipelineStage(r.stage))
		.map((r) => ({
			id: r.id,
			organizationId: r.organizationId,
			speakerProfileId: r.speakerProfileId,
			stage: r.stage as PipelineStage,
			notes: r.notes,
			score: r.score,
			rationale: r.rationale,
			name: r.name,
			email: r.email,
			company: r.company,
			jobTitle: r.jobTitle,
			updatedAt: r.updatedAt
		}));
}

/** Group cards by stage column for the kanban board. */
export function boardByStage(cards: PipelineCard[]): Record<PipelineStage, PipelineCard[]> {
	const board = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as PipelineCard[]])) as Record<
		PipelineStage,
		PipelineCard[]
	>;
	for (const card of cards) {
		board[card.stage].push(card);
	}
	return board;
}

export async function getPipelineCard(
	userId: string,
	cardId: number
): Promise<PipelineCardDetail | null> {
	if (!Number.isInteger(cardId) || cardId <= 0) return null;
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return null;

	const [row] = await db
		.select({
			id: crmPipelineCardTable.id,
			organizationId: crmPipelineCardTable.organizationId,
			speakerProfileId: crmPipelineCardTable.speakerProfileId,
			stage: crmPipelineCardTable.stage,
			notes: crmPipelineCardTable.notes,
			score: crmPipelineCardTable.score,
			rationale: crmPipelineCardTable.rationale,
			updatedAt: crmPipelineCardTable.updatedAt,
			name: speakerProfileTable.name,
			email: speakerProfileTable.email,
			company: speakerProfileTable.company,
			jobTitle: speakerProfileTable.jobTitle
		})
		.from(crmPipelineCardTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, crmPipelineCardTable.speakerProfileId)
		)
		.where(
			and(eq(crmPipelineCardTable.id, cardId), inArray(crmPipelineCardTable.organizationId, orgIds))
		)
		.limit(1);

	if (!row || !isPipelineStage(row.stage)) return null;

	const historyRows = await db
		.select({
			id: crmPipelineStageHistoryTable.id,
			fromStage: crmPipelineStageHistoryTable.fromStage,
			toStage: crmPipelineStageHistoryTable.toStage,
			changedAt: crmPipelineStageHistoryTable.changedAt
		})
		.from(crmPipelineStageHistoryTable)
		.where(eq(crmPipelineStageHistoryTable.cardId, cardId))
		.orderBy(desc(crmPipelineStageHistoryTable.changedAt), desc(crmPipelineStageHistoryTable.id));

	return {
		id: row.id,
		organizationId: row.organizationId,
		speakerProfileId: row.speakerProfileId,
		stage: row.stage,
		notes: row.notes,
		score: row.score,
		rationale: row.rationale,
		name: row.name,
		email: row.email,
		company: row.company,
		jobTitle: row.jobTitle,
		updatedAt: row.updatedAt,
		history: historyRows.map((h) => ({
			id: h.id,
			fromStage: h.fromStage && isPipelineStage(h.fromStage) ? h.fromStage : null,
			toStage: (isPipelineStage(h.toStage) ? h.toStage : row.stage) as PipelineStage,
			changedAt: h.changedAt
		}))
	};
}

export type EnrollPipelineInput = {
	stage?: PipelineStage;
	score?: number | null;
	rationale?: string | null;
};

/** Enroll a directory contact onto the board (CRM-07). */
export async function enrollContact(
	userId: string,
	speakerProfileId: number,
	input: EnrollPipelineInput = {}
): Promise<PipelineWriteResult> {
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) {
		return { ok: false, reason: 'not_found' };
	}

	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [profile] = await db
		.select({
			id: speakerProfileTable.id,
			organizationId: speakerProfileTable.organizationId
		})
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.id, speakerProfileId),
				inArray(speakerProfileTable.organizationId, orgIds)
			)
		)
		.limit(1);

	if (!profile) return { ok: false, reason: 'not_found' };

	const stage: PipelineStage =
		input.stage && isPipelineStage(input.stage) ? input.stage : 'identified';
	const score =
		input.score == null || Number.isNaN(Number(input.score))
			? null
			: Math.max(0, Math.min(100, Math.round(Number(input.score))));
	const rationale = trimOrNull(input.rationale);

	const [existing] = await db
		.select({ id: crmPipelineCardTable.id })
		.from(crmPipelineCardTable)
		.where(
			and(
				eq(crmPipelineCardTable.organizationId, profile.organizationId),
				eq(crmPipelineCardTable.speakerProfileId, speakerProfileId)
			)
		)
		.limit(1);

	if (existing) return { ok: false, reason: 'already_enrolled', cardId: existing.id };

	const cardId = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(crmPipelineCardTable)
			.values({
				organizationId: profile.organizationId,
				speakerProfileId,
				stage,
				score,
				rationale
			})
			.returning({ id: crmPipelineCardTable.id });

		await tx.insert(crmPipelineStageHistoryTable).values({
			cardId: created.id,
			fromStage: null,
			toStage: stage,
			changedByUserId: userId
		});

		return created.id;
	});

	return { ok: true, cardId };
}

/** Move a card to another stage and append history (CRM-07 / CRM-08). */
export async function movePipelineCard(
	userId: string,
	cardId: number,
	toStage: string
): Promise<PipelineWriteResult> {
	if (!isPipelineStage(toStage)) {
		return { ok: false, reason: 'invalid', message: 'Unknown pipeline stage.' };
	}
	if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, reason: 'not_found' };

	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [card] = await db
		.select({
			id: crmPipelineCardTable.id,
			stage: crmPipelineCardTable.stage,
			organizationId: crmPipelineCardTable.organizationId
		})
		.from(crmPipelineCardTable)
		.where(
			and(eq(crmPipelineCardTable.id, cardId), inArray(crmPipelineCardTable.organizationId, orgIds))
		)
		.limit(1);

	if (!card) return { ok: false, reason: 'not_found' };
	if (card.stage === toStage) return { ok: true, cardId: card.id };

	await db.transaction(async (tx) => {
		await tx
			.update(crmPipelineCardTable)
			.set({ stage: toStage })
			.where(eq(crmPipelineCardTable.id, cardId));

		await tx.insert(crmPipelineStageHistoryTable).values({
			cardId,
			fromStage: card.stage,
			toStage,
			changedByUserId: userId
		});
	});

	return { ok: true, cardId };
}

/** Persist card-scoped notes (CRM-08). */
export async function updatePipelineCardNotes(
	userId: string,
	cardId: number,
	notes: string | null
): Promise<PipelineWriteResult> {
	if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, reason: 'not_found' };

	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [updated] = await db
		.update(crmPipelineCardTable)
		.set({ notes: trimOrNull(notes) })
		.where(
			and(eq(crmPipelineCardTable.id, cardId), inArray(crmPipelineCardTable.organizationId, orgIds))
		)
		.returning({ id: crmPipelineCardTable.id });

	if (!updated) return { ok: false, reason: 'not_found' };
	return { ok: true, cardId: updated.id };
}

/** Contacts in admin orgs that are not yet on the board — for the enroll picker. */
export async function enrollableContacts(
	userId: string
): Promise<{ id: number; name: string; email: string | null; company: string | null }[]> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	const enrolled = await db
		.select({ speakerProfileId: crmPipelineCardTable.speakerProfileId })
		.from(crmPipelineCardTable)
		.where(inArray(crmPipelineCardTable.organizationId, orgIds));

	const enrolledIds = new Set(enrolled.map((e) => e.speakerProfileId));

	const profiles = await db
		.select({
			id: speakerProfileTable.id,
			name: speakerProfileTable.name,
			email: speakerProfileTable.email,
			company: speakerProfileTable.company
		})
		.from(speakerProfileTable)
		.where(inArray(speakerProfileTable.organizationId, orgIds))
		.orderBy(asc(speakerProfileTable.sortName), asc(speakerProfileTable.id));

	return profiles.filter((p) => !enrolledIds.has(p.id));
}
