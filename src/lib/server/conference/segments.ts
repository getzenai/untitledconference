/**
 * Saved CRM directory segments (CRM-09).
 *
 * A segment is a named snapshot of ContactFilters. Reopening applies the filters
 * to the live directory (dynamic / auto-updating).
 */
import { contactFiltersHref } from '$lib/conference/contact-filters';
import type { ContactFilters } from '$lib/server/conference/contacts';
import { organizerOrganizationIds } from '$lib/server/conference/contacts';
import { db } from '$lib/server/db';
import { crmSegmentTable } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

export type CrmSegmentRow = {
	id: number;
	organizationId: string;
	name: string;
	filters: ContactFilters;
	createdAt: Date;
};

export type SegmentWriteResult =
	| { ok: true; segmentId: number }
	| { ok: false; reason: 'invalid'; message: string }
	| { ok: false; reason: 'forbidden' }
	| { ok: false; reason: 'not_found' };

function serializeFilters(filters: ContactFilters): string {
	const cleaned: ContactFilters = {};
	if (filters.q?.trim()) cleaned.q = filters.q.trim();
	if (filters.company?.trim()) cleaned.company = filters.company.trim();
	if (filters.jobTitle?.trim()) cleaned.jobTitle = filters.jobTitle.trim();
	if (filters.tag?.trim()) cleaned.tag = filters.tag.trim();
	return JSON.stringify(cleaned);
}

export function parseSegmentFilters(raw: string): ContactFilters {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const out: ContactFilters = {};
		if (typeof parsed.q === 'string' && parsed.q.trim()) out.q = parsed.q.trim();
		if (typeof parsed.company === 'string' && parsed.company.trim()) {
			out.company = parsed.company.trim();
		}
		if (typeof parsed.jobTitle === 'string' && parsed.jobTitle.trim()) {
			out.jobTitle = parsed.jobTitle.trim();
		}
		if (typeof parsed.tag === 'string' && parsed.tag.trim()) out.tag = parsed.tag.trim();
		return out;
	} catch {
		return {};
	}
}

/** Build a contacts URL that reopens a segment's filters. */
export const segmentHref = contactFiltersHref;

function hasAnyFilter(filters: ContactFilters): boolean {
	return Boolean(filters.q || filters.company || filters.jobTitle || filters.tag);
}

export async function listSegments(userId: string): Promise<CrmSegmentRow[]> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	const rows = await db
		.select({
			id: crmSegmentTable.id,
			organizationId: crmSegmentTable.organizationId,
			name: crmSegmentTable.name,
			filters: crmSegmentTable.filters,
			createdAt: crmSegmentTable.createdAt
		})
		.from(crmSegmentTable)
		.where(inArray(crmSegmentTable.organizationId, orgIds))
		.orderBy(asc(crmSegmentTable.name), asc(crmSegmentTable.id));

	return rows.map((r) => ({
		id: r.id,
		organizationId: r.organizationId,
		name: r.name,
		filters: parseSegmentFilters(r.filters),
		createdAt: r.createdAt
	}));
}

export async function createSegment(
	userId: string,
	organizationId: string,
	name: string,
	filters: ContactFilters
): Promise<SegmentWriteResult> {
	const orgIds = await organizerOrganizationIds(userId);
	if (!orgIds.includes(organizationId)) return { ok: false, reason: 'forbidden' };

	const trimmed = name.trim();
	if (!trimmed) return { ok: false, reason: 'invalid', message: 'A segment name is required.' };
	if (!hasAnyFilter(filters)) {
		return {
			ok: false,
			reason: 'invalid',
			message: 'Apply at least one filter before saving a segment.'
		};
	}

	const [created] = await db
		.insert(crmSegmentTable)
		.values({
			organizationId,
			name: trimmed.slice(0, 120),
			filters: serializeFilters(filters)
		})
		.returning({ id: crmSegmentTable.id });

	return { ok: true, segmentId: created.id };
}

export async function deleteSegment(
	userId: string,
	segmentId: number
): Promise<SegmentWriteResult> {
	if (!Number.isInteger(segmentId) || segmentId <= 0) return { ok: false, reason: 'not_found' };
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [deleted] = await db
		.delete(crmSegmentTable)
		.where(and(eq(crmSegmentTable.id, segmentId), inArray(crmSegmentTable.organizationId, orgIds)))
		.returning({ id: crmSegmentTable.id });

	if (!deleted) return { ok: false, reason: 'not_found' };
	return { ok: true, segmentId: deleted.id };
}
