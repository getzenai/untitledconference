/**
 * Near-duplicate detection and merge for the speaker CRM (CRM-06).
 *
 * Duplicates: same display name (case-insensitive, whitespace-collapsed),
 * different profile id — typically different emails. Merge keeps the chosen
 * primary, re-homes conference / pipeline / submission / task links, fills empty
 * primary fields from the secondary, then deletes the secondary profile.
 */
import { parseSpeakerTags, serializeSpeakerTags } from '$lib/conference/speaker-tags';
import { db } from '$lib/server/db';
import { submissionSpeakerTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	crmPipelineCardTable,
	crmPipelineStageHistoryTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { getContact, organizerOrganizationIds, type ContactRow } from './contacts';

export type MergeWriteResult =
	| { ok: true; primaryId: number }
	| { ok: false; reason: 'invalid'; message: string }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'forbidden' };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Case-insensitive, collapsed whitespace — "Priya  Raman" ≡ "priya raman". */
export function normalizeContactName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapProfileToRow(p: {
	id: number;
	organizationId: string;
	name: string;
	sortName: string;
	email: string | null;
	jobTitle: string | null;
	company: string | null;
	headshotUrl: string | null;
	bio: string | null;
	notes: string | null;
	tags: string | null;
}): ContactRow {
	return {
		id: p.id,
		organizationId: p.organizationId,
		name: p.name,
		sortName: p.sortName,
		email: p.email,
		jobTitle: p.jobTitle,
		company: p.company,
		headshotUrl: p.headshotUrl,
		bio: p.bio,
		notes: p.notes,
		tags: parseSpeakerTags(p.tags),
		events: []
	};
}

/** Other org contacts with the same normalized name (CRM-06). */
export async function findNameDuplicates(
	userId: string,
	speakerProfileId: number
): Promise<ContactRow[]> {
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) return [];
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	const [self] = await db
		.select({
			id: speakerProfileTable.id,
			organizationId: speakerProfileTable.organizationId,
			name: speakerProfileTable.name
		})
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.id, speakerProfileId),
				inArray(speakerProfileTable.organizationId, orgIds)
			)
		)
		.limit(1);
	if (!self) return [];

	const key = normalizeContactName(self.name);
	if (!key) return [];

	const candidates = await db
		.select({
			id: speakerProfileTable.id,
			organizationId: speakerProfileTable.organizationId,
			name: speakerProfileTable.name,
			sortName: speakerProfileTable.sortName,
			email: speakerProfileTable.email,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			headshotUrl: speakerProfileTable.headshotUrl,
			bio: speakerProfileTable.bio,
			notes: speakerProfileTable.notes,
			tags: speakerProfileTable.tags
		})
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, self.organizationId),
				ne(speakerProfileTable.id, speakerProfileId),
				sql`lower(regexp_replace(trim(${speakerProfileTable.name}), '\\s+', ' ', 'g')) = ${key}`
			)
		);

	return candidates.map(mapProfileToRow);
}

/**
 * Directory rows that share a normalized name with at least one other contact
 * in the same org. Used to badge the table.
 */
export async function duplicateNameIds(userId: string): Promise<Set<number>> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return new Set();

	const rows = await db
		.select({
			id: speakerProfileTable.id,
			name: speakerProfileTable.name,
			organizationId: speakerProfileTable.organizationId
		})
		.from(speakerProfileTable)
		.where(inArray(speakerProfileTable.organizationId, orgIds));

	const byKey = new Map<string, number[]>();
	for (const row of rows) {
		const key = `${row.organizationId}::${normalizeContactName(row.name)}`;
		const list = byKey.get(key) ?? [];
		list.push(row.id);
		byKey.set(key, list);
	}

	const dups = new Set<number>();
	for (const ids of byKey.values()) {
		if (ids.length > 1) for (const id of ids) dups.add(id);
	}
	return dups;
}

async function rehomeConferenceSpeakers(
	tx: Tx,
	primaryId: number,
	secondaryId: number
): Promise<void> {
	const secondaryRows = await tx
		.select({
			id: conferenceSpeakerTable.id,
			conferenceId: conferenceSpeakerTable.conferenceId
		})
		.from(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.speakerProfileId, secondaryId));

	for (const row of secondaryRows) {
		const [existing] = await tx
			.select({ id: conferenceSpeakerTable.id })
			.from(conferenceSpeakerTable)
			.where(
				and(
					eq(conferenceSpeakerTable.conferenceId, row.conferenceId),
					eq(conferenceSpeakerTable.speakerProfileId, primaryId)
				)
			)
			.limit(1);
		if (existing) {
			await tx.delete(conferenceSpeakerTable).where(eq(conferenceSpeakerTable.id, row.id));
		} else {
			await tx
				.update(conferenceSpeakerTable)
				.set({ speakerProfileId: primaryId })
				.where(eq(conferenceSpeakerTable.id, row.id));
		}
	}
}

async function rehomeSubmissionSpeakers(
	tx: Tx,
	primaryId: number,
	secondaryId: number
): Promise<void> {
	const secondaryRows = await tx
		.select({
			id: submissionSpeakerTable.id,
			submissionId: submissionSpeakerTable.submissionId
		})
		.from(submissionSpeakerTable)
		.where(eq(submissionSpeakerTable.speakerProfileId, secondaryId));

	for (const row of secondaryRows) {
		const [existing] = await tx
			.select({ id: submissionSpeakerTable.id })
			.from(submissionSpeakerTable)
			.where(
				and(
					eq(submissionSpeakerTable.submissionId, row.submissionId),
					eq(submissionSpeakerTable.speakerProfileId, primaryId)
				)
			)
			.limit(1);
		if (existing) {
			await tx.delete(submissionSpeakerTable).where(eq(submissionSpeakerTable.id, row.id));
		} else {
			await tx
				.update(submissionSpeakerTable)
				.set({ speakerProfileId: primaryId })
				.where(eq(submissionSpeakerTable.id, row.id));
		}
	}
}

async function rehomePipelineCards(tx: Tx, primaryId: number, secondaryId: number): Promise<void> {
	const [secondaryCard] = await tx
		.select()
		.from(crmPipelineCardTable)
		.where(eq(crmPipelineCardTable.speakerProfileId, secondaryId))
		.limit(1);
	if (!secondaryCard) return;

	const [primaryCard] = await tx
		.select({ id: crmPipelineCardTable.id })
		.from(crmPipelineCardTable)
		.where(
			and(
				eq(crmPipelineCardTable.organizationId, secondaryCard.organizationId),
				eq(crmPipelineCardTable.speakerProfileId, primaryId)
			)
		)
		.limit(1);

	if (primaryCard) {
		await tx
			.delete(crmPipelineStageHistoryTable)
			.where(eq(crmPipelineStageHistoryTable.cardId, secondaryCard.id));
		await tx.delete(crmPipelineCardTable).where(eq(crmPipelineCardTable.id, secondaryCard.id));
	} else {
		await tx
			.update(crmPipelineCardTable)
			.set({ speakerProfileId: primaryId })
			.where(eq(crmPipelineCardTable.id, secondaryCard.id));
	}
}

async function rehomeTasks(tx: Tx, primaryId: number, secondaryId: number): Promise<void> {
	await tx
		.update(taskTable)
		.set({ speakerProfileId: primaryId })
		.where(eq(taskTable.speakerProfileId, secondaryId));
}

function mergeText(primary: string | null, secondary: string | null): string | null {
	if (primary?.trim()) return primary;
	return secondary?.trim() ? secondary : primary;
}

function mergeNotes(primary: string | null, secondary: string | null): string | null {
	const a = primary?.trim() ?? '';
	const b = secondary?.trim() ?? '';
	if (a && b && a !== b) return `${a}\n\n— merged from duplicate —\n${b}`;
	return a || b || null;
}

function mergeTags(primary: string | null, secondary: string | null): string | null {
	const set = new Set([...parseSpeakerTags(primary), ...parseSpeakerTags(secondary)]);
	if (set.size === 0) return null;
	return serializeSpeakerTags([...set]);
}

/**
 * Merge secondary into primary. Irreversible: secondary profile is deleted.
 * Caller must have confirmed primary is the surviving record.
 */
export async function mergeContacts(
	userId: string,
	primaryId: number,
	secondaryId: number
): Promise<MergeWriteResult> {
	if (primaryId === secondaryId) {
		return { ok: false, reason: 'invalid', message: 'Pick two different contacts to merge.' };
	}
	if (!Number.isInteger(primaryId) || !Number.isInteger(secondaryId)) {
		return { ok: false, reason: 'not_found' };
	}

	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [primary, secondary] = await Promise.all([
		db
			.select()
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.id, primaryId),
					inArray(speakerProfileTable.organizationId, orgIds)
				)
			)
			.limit(1)
			.then((r) => r[0] ?? null),
		db
			.select()
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.id, secondaryId),
					inArray(speakerProfileTable.organizationId, orgIds)
				)
			)
			.limit(1)
			.then((r) => r[0] ?? null)
	]);

	if (!primary || !secondary) return { ok: false, reason: 'not_found' };
	if (primary.organizationId !== secondary.organizationId) {
		return { ok: false, reason: 'forbidden' };
	}

	await db.transaction(async (tx) => {
		await rehomeConferenceSpeakers(tx, primaryId, secondaryId);
		await rehomeSubmissionSpeakers(tx, primaryId, secondaryId);
		await rehomePipelineCards(tx, primaryId, secondaryId);
		await rehomeTasks(tx, primaryId, secondaryId);

		await tx
			.update(speakerProfileTable)
			.set({
				email: mergeText(primary.email, secondary.email),
				jobTitle: mergeText(primary.jobTitle, secondary.jobTitle),
				company: mergeText(primary.company, secondary.company),
				bio: mergeText(primary.bio, secondary.bio),
				headshotUrl: mergeText(primary.headshotUrl, secondary.headshotUrl),
				links: mergeText(primary.links, secondary.links),
				notes: mergeNotes(primary.notes, secondary.notes),
				tags: mergeTags(primary.tags, secondary.tags)
			})
			.where(eq(speakerProfileTable.id, primaryId));

		await tx.delete(speakerProfileTable).where(eq(speakerProfileTable.id, secondaryId));
	});

	const stillThere = await getContact(userId, primaryId);
	if (!stillThere) return { ok: false, reason: 'not_found' };
	return { ok: true, primaryId };
}
