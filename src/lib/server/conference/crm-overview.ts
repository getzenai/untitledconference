/**
 * Org-wide CRM dashboard numbers (CRM-12).
 */
import { db } from '$lib/server/db';
import {
	conferenceSpeakerTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { and, asc, count, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { organizerOrganizationIds } from './contacts';

export type CrmCompanyBucket = {
	company: string;
	count: number;
};

export type CrmOverview = {
	/** Speaker profiles in orgs the user administers. */
	totalContacts: number;
	/** Distinct conferences that already have at least one directory contact on the roster. */
	eventsWithSpeakers: number;
	/** Contacts linked to two or more events — the "returning speaker" KPI. */
	returningSpeakers: number;
	/** Top companies by contact count (analytics widget; drill-through via company filter). */
	topCompanies: CrmCompanyBucket[];
};

const TOP_COMPANIES_LIMIT = 8;

const emptyOverview = (): CrmOverview => ({
	totalContacts: 0,
	eventsWithSpeakers: 0,
	returningSpeakers: 0,
	topCompanies: []
});

async function loadOverviewMetrics(orgScope: SQL): Promise<CrmOverview> {
	const [[totalRow], eventRows, multiEventRows, companyRows] = await Promise.all([
		db.select({ n: count() }).from(speakerProfileTable).where(orgScope),
		db
			.select({ conferenceId: conferenceSpeakerTable.conferenceId })
			.from(conferenceSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, conferenceSpeakerTable.speakerProfileId)
			)
			.where(orgScope)
			.groupBy(conferenceSpeakerTable.conferenceId),
		db
			.select({ speakerProfileId: conferenceSpeakerTable.speakerProfileId })
			.from(conferenceSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, conferenceSpeakerTable.speakerProfileId)
			)
			.where(orgScope)
			.groupBy(conferenceSpeakerTable.speakerProfileId)
			.having(sql`count(*) >= 2`),
		db
			.select({
				company: speakerProfileTable.company,
				n: sql<number>`count(*)::int`
			})
			.from(speakerProfileTable)
			.where(
				and(
					orgScope,
					isNotNull(speakerProfileTable.company),
					sql`trim(${speakerProfileTable.company}) <> ''`
				)
			)
			.groupBy(speakerProfileTable.company)
			.orderBy(desc(sql`count(*)`), asc(speakerProfileTable.company))
			.limit(TOP_COMPANIES_LIMIT)
	]);

	return {
		totalContacts: Number(totalRow?.n ?? 0),
		eventsWithSpeakers: eventRows.length,
		returningSpeakers: multiEventRows.length,
		topCompanies: companyRows
			.filter((r): r is { company: string; n: number } => Boolean(r.company?.trim()))
			.map((r) => ({ company: r.company!.trim(), count: Number(r.n) }))
	};
}

/**
 * Counts match the unfiltered directory so the total-contacts KPI is consistent
 * with the contacts table. Top companies feed the analytics widget.
 */
export async function getCrmOverview(userId: string): Promise<CrmOverview> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return emptyOverview();
	return loadOverviewMetrics(inArray(speakerProfileTable.organizationId, orgIds));
}
