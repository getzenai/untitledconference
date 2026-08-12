/**
 * Org-wide speaker directory (Speaker CRM).
 *
 * Identity on `speaker_profile` (CRM-01). Event participation is a
 * `conference_speaker` row (CRM-10 handoff is an insert, not a copy). Notes and
 * tags sit on the profile so they survive across events (CRM-03 / CRM-04).
 *
 * Access: organizations the user owns or administers. Conference-only organizers
 * keep using `/manage/[slug]/speakers`.
 */
import type { SpeakerCsvRow } from '$lib/conference/speaker-csv';
import {
	parseSpeakerTags,
	serializeSpeakerTags,
	tagsFromFormInput
} from '$lib/conference/speaker-tags';
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { guessSortName } from './cfp-submission';
import {
	addSpeakerToConference,
	isSpeakerStatus,
	type AddSpeakerInput,
	type SpeakerStatus,
	type SpeakersWriteResult
} from './speakers';

const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

/** Thrown inside importContacts so Drizzle rolls the transaction back. */
class AbortImport extends Error {
	constructor(readonly problem: string) {
		super(problem);
		this.name = 'AbortImport';
	}
}

export type ContactFilters = {
	q?: string;
	company?: string;
	jobTitle?: string;
	tag?: string;
};

export type ContactEventLink = {
	conferenceId: number;
	slug: string;
	name: string;
	status: SpeakerStatus;
};

export type ContactRow = {
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
	tags: string[];
	events: ContactEventLink[];
};

export type ContactSessionLink = {
	submissionId: number;
	title: string;
	conferenceId: number;
	conferenceSlug: string;
	conferenceName: string;
};

export type ContactDetail = ContactRow & { sessions: ContactSessionLink[] };

export type ContactWriteResult =
	| { ok: true; speakerProfileId: number }
	| { ok: false; reason: 'invalid'; message: string }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'forbidden' };

function trimOrNull(value: string | null | undefined): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

function tagsColumn(input: string | string[] | null | undefined): string | null | undefined {
	if (input === undefined) return undefined;
	if (input == null) return null;
	return Array.isArray(input)
		? serializeSpeakerTags(input)
		: serializeSpeakerTags(tagsFromFormInput(input));
}

/** Organizations where this user is owner or admin — the CRM scope. */
export async function organizerOrganizationIds(userId: string): Promise<string[]> {
	const seats = await db
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, userId));
	return seats
		.filter((s) => ORG_WIDE_ORGANIZER_ROLES.includes(s.role))
		.map((s) => s.organizationId);
}

function contactFilterConditions(filters: ContactFilters): SQL[] {
	const conditions: SQL[] = [];
	const q = filters.q?.trim();
	if (q) {
		const pattern = `%${q}%`;
		conditions.push(
			or(
				ilike(speakerProfileTable.name, pattern),
				ilike(speakerProfileTable.email, pattern),
				ilike(speakerProfileTable.jobTitle, pattern),
				ilike(speakerProfileTable.company, pattern),
				ilike(speakerProfileTable.sortName, pattern)
			)!
		);
	}
	if (filters.company?.trim()) {
		conditions.push(ilike(speakerProfileTable.company, `%${filters.company.trim()}%`));
	}
	if (filters.jobTitle?.trim()) {
		conditions.push(ilike(speakerProfileTable.jobTitle, `%${filters.jobTitle.trim()}%`));
	}
	if (filters.tag?.trim()) {
		// Tags are a JSON string array; substring match is enough for short labels.
		conditions.push(ilike(speakerProfileTable.tags, `%"${filters.tag.trim().replace(/"/g, '')}"%`));
	}
	return conditions;
}

async function eventsForProfiles(profileIds: number[]): Promise<Map<number, ContactEventLink[]>> {
	const map = new Map<number, ContactEventLink[]>();
	if (profileIds.length === 0) return map;

	const rows = await db
		.select({
			speakerProfileId: conferenceSpeakerTable.speakerProfileId,
			conferenceId: conferenceTable.id,
			slug: conferenceTable.slug,
			name: conferenceTable.name,
			status: conferenceSpeakerTable.status
		})
		.from(conferenceSpeakerTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, conferenceSpeakerTable.conferenceId))
		.where(inArray(conferenceSpeakerTable.speakerProfileId, profileIds))
		.orderBy(asc(conferenceTable.name));

	for (const row of rows) {
		const list = map.get(row.speakerProfileId) ?? [];
		list.push({
			conferenceId: row.conferenceId,
			slug: row.slug,
			name: row.name,
			status: row.status as SpeakerStatus
		});
		map.set(row.speakerProfileId, list);
	}
	return map;
}

/** Org-wide directory with optional multi-criteria filters (CRM-01 / CRM-02). */
export async function listContacts(
	userId: string,
	filters: ContactFilters = {}
): Promise<ContactRow[]> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	const profiles = await db
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
			and(inArray(speakerProfileTable.organizationId, orgIds), ...contactFilterConditions(filters))
		)
		.orderBy(asc(speakerProfileTable.sortName), asc(speakerProfileTable.id));

	const eventsByProfile = await eventsForProfiles(profiles.map((p) => p.id));
	return profiles.map((p) => ({
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
		events: eventsByProfile.get(p.id) ?? []
	}));
}

/** One contact with linked events and submissions (CRM-03). */
export async function getContact(
	userId: string,
	speakerProfileId: number
): Promise<ContactDetail | null> {
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) return null;
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return null;

	const [profile] = await db
		.select()
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.id, speakerProfileId),
				inArray(speakerProfileTable.organizationId, orgIds)
			)
		)
		.limit(1);
	if (!profile) return null;

	const [eventsByProfile, sessions] = await Promise.all([
		eventsForProfiles([speakerProfileId]),
		db
			.select({
				submissionId: submissionTable.id,
				title: submissionTable.title,
				conferenceId: conferenceTable.id,
				conferenceSlug: conferenceTable.slug,
				conferenceName: conferenceTable.name
			})
			.from(submissionSpeakerTable)
			.innerJoin(submissionTable, eq(submissionTable.id, submissionSpeakerTable.submissionId))
			.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
			.where(eq(submissionSpeakerTable.speakerProfileId, speakerProfileId))
			.orderBy(asc(conferenceTable.name), asc(submissionTable.title))
	]);

	return {
		id: profile.id,
		organizationId: profile.organizationId,
		name: profile.name,
		sortName: profile.sortName,
		email: profile.email,
		jobTitle: profile.jobTitle,
		company: profile.company,
		headshotUrl: profile.headshotUrl,
		bio: profile.bio,
		notes: profile.notes,
		tags: parseSpeakerTags(profile.tags),
		events: eventsByProfile.get(speakerProfileId) ?? [],
		sessions
	};
}

export type UpdateContactInput = {
	name: string;
	email?: string | null;
	jobTitle?: string | null;
	company?: string | null;
	bio?: string | null;
	sortName?: string | null;
	notes?: string | null;
	tags?: string | string[] | null;
};

function profileFieldsFromInput(input: UpdateContactInput, name: string) {
	const tags = tagsColumn(input.tags);
	return {
		name: name.slice(0, 200),
		sortName: (input.sortName?.trim() || guessSortName(name)).slice(0, 200),
		email: trimOrNull(input.email),
		jobTitle: trimOrNull(input.jobTitle),
		company: trimOrNull(input.company),
		bio: trimOrNull(input.bio),
		notes: trimOrNull(input.notes),
		...(tags !== undefined ? { tags } : {})
	};
}

/** Persist identity + notes + tags on the org-wide profile (CRM-03/04). */
export async function updateContact(
	userId: string,
	speakerProfileId: number,
	input: UpdateContactInput
): Promise<ContactWriteResult> {
	const name = input.name?.trim() ?? '';
	if (!name) return { ok: false, reason: 'invalid', message: 'A name is required.' };
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) {
		return { ok: false, reason: 'not_found' };
	}

	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { ok: false, reason: 'forbidden' };

	const [updated] = await db
		.update(speakerProfileTable)
		.set(profileFieldsFromInput(input, name))
		.where(
			and(
				eq(speakerProfileTable.id, speakerProfileId),
				inArray(speakerProfileTable.organizationId, orgIds)
			)
		)
		.returning({ id: speakerProfileTable.id });

	if (!updated) return { ok: false, reason: 'not_found' };
	return { ok: true, speakerProfileId: updated.id };
}

export type CreateContactInput = AddSpeakerInput & { tags?: string | string[] | null };

/** Create a contact in the organization without putting them on an event. */
export async function createContact(
	userId: string,
	organizationId: string,
	input: CreateContactInput
): Promise<ContactWriteResult> {
	const orgIds = await organizerOrganizationIds(userId);
	if (!orgIds.includes(organizationId)) return { ok: false, reason: 'forbidden' };

	const name = input.name?.trim() ?? '';
	if (!name) return { ok: false, reason: 'invalid', message: 'A name is required.' };

	const email = trimOrNull(input.email);
	if (email) {
		const [existing] = await db
			.select({ id: speakerProfileTable.id })
			.from(speakerProfileTable)
			.where(
				and(
					eq(speakerProfileTable.organizationId, organizationId),
					eq(speakerProfileTable.email, email)
				)
			)
			.limit(1);
		if (existing) return { ok: true, speakerProfileId: existing.id };
	}

	const [created] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: name.slice(0, 200),
			sortName: (input.sortName?.trim() || guessSortName(name)).slice(0, 200),
			email,
			jobTitle: trimOrNull(input.jobTitle),
			company: trimOrNull(input.company),
			bio: trimOrNull(input.bio),
			notes: trimOrNull(input.notes),
			tags: tagsColumn(input.tags) ?? null
		})
		.returning({ id: speakerProfileTable.id });

	return { ok: true, speakerProfileId: created.id };
}

export type ImportContactsResult =
	| { ok: true; added: number; skipped: string[] }
	| { ok: false; problem: string };

/** Bulk-create org contacts from a CSV (CRM-05). Does not place anyone on a roster. */
export async function importContacts(
	userId: string,
	organizationId: string,
	rows: SpeakerCsvRow[]
): Promise<ImportContactsResult> {
	const orgIds = await organizerOrganizationIds(userId);
	if (!orgIds.includes(organizationId)) {
		return { ok: false, problem: 'You do not administer this organization.' };
	}

	// Throw on bad rows so Drizzle rolls back — a plain `return { ok: false }` would
	// commit every insert that already ran in the transaction.
	try {
		return await db.transaction(async (tx) => {
			let added = 0;
			const skipped: string[] = [];

			for (const row of rows) {
				const name = row.name?.trim() ?? '';
				if (!name) throw new AbortImport(`Row ${row.line}: A name is required.`);
				const email = trimOrNull(row.email);

				if (email) {
					const [existing] = await tx
						.select({ id: speakerProfileTable.id })
						.from(speakerProfileTable)
						.where(
							and(
								eq(speakerProfileTable.organizationId, organizationId),
								eq(speakerProfileTable.email, email)
							)
						)
						.limit(1);
					if (existing) {
						skipped.push(name);
						continue;
					}
				}

				await tx.insert(speakerProfileTable).values({
					organizationId,
					name: name.slice(0, 200),
					sortName: guessSortName(name).slice(0, 200),
					email,
					jobTitle: trimOrNull(row.jobTitle),
					company: trimOrNull(row.company),
					bio: trimOrNull(row.bio),
					notes: trimOrNull(row.notes)
				});
				added += 1;
			}

			return { ok: true, added, skipped };
		});
	} catch (err) {
		if (err instanceof AbortImport) return { ok: false, problem: err.problem };
		throw err;
	}
}

/**
 * Insert a conference_speaker row for an existing same-org profile.
 * Used when the contact has no email (cannot be found via the email upsert path).
 */
export async function attachProfileToConference(
	conference: Pick<Conference, 'id' | 'organizationId'>,
	speakerProfileId: number,
	status: SpeakerStatus = 'invited'
): Promise<SpeakersWriteResult> {
	if (!isSpeakerStatus(status)) {
		return { ok: false, reason: 'invalid', message: 'Unknown speaker status.' };
	}

	const [profile] = await db
		.select({
			id: speakerProfileTable.id,
			organizationId: speakerProfileTable.organizationId
		})
		.from(speakerProfileTable)
		.where(eq(speakerProfileTable.id, speakerProfileId))
		.limit(1);

	if (!profile || profile.organizationId !== conference.organizationId) {
		return { ok: false, reason: 'not_found' };
	}

	const [membership] = await db
		.insert(conferenceSpeakerTable)
		.values({ conferenceId: conference.id, speakerProfileId, status })
		.onConflictDoNothing()
		.returning({ id: conferenceSpeakerTable.id });

	if (!membership) return { ok: false, reason: 'already_on_roster', speakerProfileId };
	return { ok: true, speakerProfileId, conferenceSpeakerId: membership.id };
}

/** Push a directory contact onto a conference roster (CRM-10). */
export async function pushContactToConference(
	userId: string,
	speakerProfileId: number,
	conferenceSlug: string,
	status: SpeakerStatus = 'invited'
): Promise<SpeakersWriteResult> {
	const contact = await getContact(userId, speakerProfileId);
	if (!contact) return { ok: false, reason: 'not_found' };

	const [conference] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, conferenceSlug))
		.limit(1);

	if (!conference || conference.organizationId !== contact.organizationId) {
		return { ok: false, reason: 'not_found' };
	}

	if (contact.email) {
		return addSpeakerToConference(conference, {
			name: contact.name,
			email: contact.email,
			jobTitle: contact.jobTitle,
			company: contact.company,
			bio: contact.bio,
			sortName: contact.sortName,
			notes: contact.notes,
			status
		});
	}

	return attachProfileToConference(conference, speakerProfileId, status);
}

/** Conferences in orgs the user administers — targets for CRM-10 push. */
export async function pushableConferences(
	userId: string
): Promise<Pick<Conference, 'id' | 'name' | 'slug' | 'organizationId'>[]> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return [];

	return db
		.select({
			id: conferenceTable.id,
			name: conferenceTable.name,
			slug: conferenceTable.slug,
			organizationId: conferenceTable.organizationId
		})
		.from(conferenceTable)
		.where(inArray(conferenceTable.organizationId, orgIds))
		.orderBy(asc(conferenceTable.name));
}

/** Distinct company / job title / tag values for filter dropdowns (CRM-02). */
export async function contactFilterOptions(userId: string): Promise<{
	companies: string[];
	jobTitles: string[];
	tags: string[];
}> {
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return { companies: [], jobTitles: [], tags: [] };

	const rows = await db
		.select({
			company: speakerProfileTable.company,
			jobTitle: speakerProfileTable.jobTitle,
			tags: speakerProfileTable.tags
		})
		.from(speakerProfileTable)
		.where(inArray(speakerProfileTable.organizationId, orgIds));

	const companies = new Set<string>();
	const jobTitles = new Set<string>();
	const tags = new Set<string>();
	for (const row of rows) {
		if (row.company?.trim()) companies.add(row.company.trim());
		if (row.jobTitle?.trim()) jobTitles.add(row.jobTitle.trim());
		for (const tag of parseSpeakerTags(row.tags)) tags.add(tag);
	}

	const sort = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
	return {
		companies: [...companies].sort(sort),
		jobTitles: [...jobTitles].sort(sort),
		tags: [...tags].sort(sort)
	};
}

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

/**
 * Org-wide CRM dashboard numbers (CRM-12).
 *
 * Counts match the unfiltered directory so the total-contacts KPI is consistent
 * with the table below. Top companies feed the analytics widget and link into
 * the existing company filter on this same page.
 */
export async function getCrmOverview(userId: string): Promise<CrmOverview> {
	const empty: CrmOverview = {
		totalContacts: 0,
		eventsWithSpeakers: 0,
		returningSpeakers: 0,
		topCompanies: []
	};
	const orgIds = await organizerOrganizationIds(userId);
	if (orgIds.length === 0) return empty;

	const orgScope = inArray(speakerProfileTable.organizationId, orgIds);

	const [[totalRow], eventRows, multiEventRows, companyRows] = await Promise.all([
		db.select({ n: count() }).from(speakerProfileTable).where(orgScope),
		db
			.select({
				conferenceId: conferenceSpeakerTable.conferenceId
			})
			.from(conferenceSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(speakerProfileTable.id, conferenceSpeakerTable.speakerProfileId)
			)
			.where(orgScope)
			.groupBy(conferenceSpeakerTable.conferenceId),
		db
			.select({
				speakerProfileId: conferenceSpeakerTable.speakerProfileId
			})
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
