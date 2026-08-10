/**
 * Organizer speaker roster (SPK-01 / SPK-02 / SPK-04).
 *
 * Conference participation lives on `conference_speaker` (status is per event).
 * Identity lives on org-scoped `speaker_profile` (CRM-01). Adding a speaker is
 * always both: a profile row (reuse by email when one already exists in the org)
 * and a conference membership with a filterable workflow status.
 */
import { db } from '$lib/server/db';
import {
	conferenceSpeakerTable,
	speakerProfileTable,
	type Conference,
	type ConferenceSpeaker
} from '$lib/server/db/conference/conference-schema';
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { guessSortName } from './cfp-submission';

export const SPEAKER_STATUSES = ['invited', 'confirmed', 'declined', 'cancelled'] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

export type SpeakerRosterFilters = {
	q?: string;
	/** When set, only speakers carrying this conference_speaker status. */
	status?: SpeakerStatus;
};

export type SpeakerRosterRow = {
	conferenceSpeakerId: number;
	speakerProfileId: number;
	status: SpeakerStatus;
	logistics: string | null;
	name: string;
	sortName: string;
	email: string | null;
	jobTitle: string | null;
	company: string | null;
	headshotUrl: string | null;
	bio: string | null;
	notes: string | null;
	hasAccount: boolean;
};

export type AddSpeakerInput = {
	name: string;
	email?: string | null;
	jobTitle?: string | null;
	company?: string | null;
	bio?: string | null;
	sortName?: string | null;
	status?: SpeakerStatus;
	notes?: string | null;
	logistics?: string | null;
};

export type UpdateProfileInput = {
	name: string;
	email?: string | null;
	jobTitle?: string | null;
	company?: string | null;
	bio?: string | null;
	sortName?: string | null;
	notes?: string | null;
};

export type SpeakersWriteResult =
	| { ok: true; speakerProfileId: number; conferenceSpeakerId: number }
	| { ok: false; reason: 'invalid'; message: string }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'already_on_roster'; speakerProfileId: number };

export function isSpeakerStatus(value: string): value is SpeakerStatus {
	return (SPEAKER_STATUSES as readonly string[]).includes(value);
}

function trimOrNull(value: string | null | undefined): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

function rosterConditions(conferenceId: number, filters: SpeakerRosterFilters): SQL[] {
	const conditions: SQL[] = [eq(conferenceSpeakerTable.conferenceId, conferenceId)];
	if (filters.status) {
		conditions.push(eq(conferenceSpeakerTable.status, filters.status));
	}
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
	return conditions;
}

function toRosterRow(row: {
	conferenceSpeakerId: number;
	speakerProfileId: number;
	status: string;
	logistics: string | null;
	name: string;
	sortName: string;
	email: string | null;
	jobTitle: string | null;
	company: string | null;
	headshotUrl: string | null;
	bio: string | null;
	notes: string | null;
	userId: string | null;
}): SpeakerRosterRow {
	return {
		conferenceSpeakerId: row.conferenceSpeakerId,
		speakerProfileId: row.speakerProfileId,
		status: row.status as SpeakerStatus,
		logistics: row.logistics,
		name: row.name,
		sortName: row.sortName,
		email: row.email,
		jobTitle: row.jobTitle,
		company: row.company,
		headshotUrl: row.headshotUrl,
		bio: row.bio,
		notes: row.notes,
		hasAccount: row.userId != null
	};
}

/**
 * Speakers on this conference, identity + status, optional search and status filter.
 * Search is case-insensitive across identity fields; order is `sortName` (SPK-01).
 */
export async function listConferenceSpeakers(
	conferenceId: number,
	filters: SpeakerRosterFilters = {}
): Promise<SpeakerRosterRow[]> {
	const rows = await db
		.select({
			conferenceSpeakerId: conferenceSpeakerTable.id,
			speakerProfileId: speakerProfileTable.id,
			status: conferenceSpeakerTable.status,
			logistics: conferenceSpeakerTable.logistics,
			name: speakerProfileTable.name,
			sortName: speakerProfileTable.sortName,
			email: speakerProfileTable.email,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			headshotUrl: speakerProfileTable.headshotUrl,
			bio: speakerProfileTable.bio,
			notes: speakerProfileTable.notes,
			userId: speakerProfileTable.userId
		})
		.from(conferenceSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, conferenceSpeakerTable.speakerProfileId)
		)
		.where(and(...rosterConditions(conferenceId, filters)))
		.orderBy(asc(speakerProfileTable.sortName), asc(speakerProfileTable.id));

	return rows.map(toRosterRow);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type NormalizedAdd = {
	name: string;
	status: SpeakerStatus;
	email: string | null;
	sortName: string;
	jobTitle: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
	logistics: string | null;
};

function normalizeAddInput(input: AddSpeakerInput): NormalizedAdd | SpeakersWriteResult {
	const name = input.name?.trim() ?? '';
	if (!name) return { ok: false, reason: 'invalid', message: 'A name is required.' };
	return {
		name: name.slice(0, 200),
		status: input.status && isSpeakerStatus(input.status) ? input.status : 'invited',
		email: trimOrNull(input.email),
		sortName: (input.sortName?.trim() || guessSortName(name)).slice(0, 200),
		jobTitle: trimOrNull(input.jobTitle),
		company: trimOrNull(input.company),
		bio: trimOrNull(input.bio),
		notes: trimOrNull(input.notes),
		logistics: trimOrNull(input.logistics)
	};
}

async function findProfileByEmail(
	tx: Tx,
	organizationId: string,
	email: string
): Promise<{
	id: number;
	jobTitle: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
} | null> {
	const [existing] = await tx
		.select({
			id: speakerProfileTable.id,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			bio: speakerProfileTable.bio,
			notes: speakerProfileTable.notes
		})
		.from(speakerProfileTable)
		.where(
			and(
				eq(speakerProfileTable.organizationId, organizationId),
				eq(speakerProfileTable.email, email)
			)
		)
		.limit(1);
	return existing ?? null;
}

/** True when a stored optional field is missing and the add form supplied a value. */
function blankToFill(
	existing: string | null | undefined,
	incoming: string | null
): string | undefined {
	if (incoming == null) return undefined;
	if (existing != null && existing.trim() !== '') return undefined;
	return incoming;
}

async function upsertProfileForAdd(
	tx: Tx,
	organizationId: string,
	fields: NormalizedAdd
): Promise<number> {
	const existing = fields.email
		? await findProfileByEmail(tx, organizationId, fields.email)
		: null;

	if (existing == null) {
		const [created] = await tx
			.insert(speakerProfileTable)
			.values({
				organizationId,
				name: fields.name,
				sortName: fields.sortName,
				email: fields.email,
				jobTitle: fields.jobTitle,
				company: fields.company,
				bio: fields.bio,
				notes: fields.notes
			})
			.returning({ id: speakerProfileTable.id });
		return created.id;
	}

	// Reuse: never overwrite identity (name/sortName/email). Only fill empty optionals
	// so a typo on conference A cannot rewrite a speaker already on conference B.
	const patch: {
		jobTitle?: string;
		company?: string;
		bio?: string;
		notes?: string;
	} = {};
	const jobTitle = blankToFill(existing.jobTitle, fields.jobTitle);
	const company = blankToFill(existing.company, fields.company);
	const bio = blankToFill(existing.bio, fields.bio);
	const notes = blankToFill(existing.notes, fields.notes);
	if (jobTitle !== undefined) patch.jobTitle = jobTitle;
	if (company !== undefined) patch.company = company;
	if (bio !== undefined) patch.bio = bio;
	if (notes !== undefined) patch.notes = notes;

	if (Object.keys(patch).length > 0) {
		await tx
			.update(speakerProfileTable)
			.set(patch)
			.where(eq(speakerProfileTable.id, existing.id));
	}
	return existing.id;
}

/**
 * Create (or reuse by email) a profile in the conference's org and put them on
 * this event's roster with a workflow status (SPK-02 + SPK-04).
 */
export async function addSpeakerToConference(
	conference: Pick<Conference, 'id' | 'organizationId'>,
	input: AddSpeakerInput
): Promise<SpeakersWriteResult> {
	const fields = normalizeAddInput(input);
	if ('ok' in fields) return fields;

	return db.transaction(async (tx) => {
		const profileId = await upsertProfileForAdd(tx, conference.organizationId, fields);
		const [membership] = await tx
			.insert(conferenceSpeakerTable)
			.values({
				conferenceId: conference.id,
				speakerProfileId: profileId,
				status: fields.status,
				logistics: fields.logistics
			})
			.onConflictDoNothing()
			.returning({ id: conferenceSpeakerTable.id });

		if (!membership) {
			return { ok: false, reason: 'already_on_roster', speakerProfileId: profileId };
		}
		return {
			ok: true,
			speakerProfileId: profileId,
			conferenceSpeakerId: membership.id
		};
	});
}

/**
 * Persist organizer edits to identity fields (SPK-02).
 *
 * Membership is required: the profile must sit on this conference's roster.
 * Org-only scoping would let a conference-A organizer rewrite a sister-conference
 * profile that is never on A's roster.
 */
export async function updateSpeakerProfile(
	conferenceId: number,
	speakerProfileId: number,
	input: UpdateProfileInput
): Promise<SpeakersWriteResult> {
	const name = input.name?.trim() ?? '';
	if (!name) return { ok: false, reason: 'invalid', message: 'A name is required.' };
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) {
		return { ok: false, reason: 'not_found' };
	}

	const [membership] = await db
		.select({
			conferenceSpeakerId: conferenceSpeakerTable.id,
			speakerProfileId: conferenceSpeakerTable.speakerProfileId
		})
		.from(conferenceSpeakerTable)
		.where(
			and(
				eq(conferenceSpeakerTable.conferenceId, conferenceId),
				eq(conferenceSpeakerTable.speakerProfileId, speakerProfileId)
			)
		)
		.limit(1);

	if (!membership) return { ok: false, reason: 'not_found' };

	const [updated] = await db
		.update(speakerProfileTable)
		.set({
			name: name.slice(0, 200),
			sortName: (input.sortName?.trim() || guessSortName(name)).slice(0, 200),
			email: trimOrNull(input.email),
			jobTitle: trimOrNull(input.jobTitle),
			company: trimOrNull(input.company),
			bio: trimOrNull(input.bio),
			notes: trimOrNull(input.notes)
		})
		.where(eq(speakerProfileTable.id, speakerProfileId))
		.returning({ id: speakerProfileTable.id });

	if (!updated) return { ok: false, reason: 'not_found' };
	return {
		ok: true,
		speakerProfileId: updated.id,
		conferenceSpeakerId: membership.conferenceSpeakerId
	};
}

/**
 * Change workflow status on the conference membership only (SPK-04).
 * The org-wide profile is untouched — same person can confirm one event and decline another.
 */
export async function updateSpeakerStatus(
	conferenceId: number,
	speakerProfileId: number,
	status: string
): Promise<SpeakersWriteResult> {
	if (!isSpeakerStatus(status)) {
		return { ok: false, reason: 'invalid', message: 'Unknown speaker status.' };
	}
	if (!Number.isInteger(speakerProfileId) || speakerProfileId <= 0) {
		return { ok: false, reason: 'not_found' };
	}

	const [updated] = await db
		.update(conferenceSpeakerTable)
		.set({ status })
		.where(
			and(
				eq(conferenceSpeakerTable.conferenceId, conferenceId),
				eq(conferenceSpeakerTable.speakerProfileId, speakerProfileId)
			)
		)
		.returning({
			id: conferenceSpeakerTable.id,
			speakerProfileId: conferenceSpeakerTable.speakerProfileId
		});

	if (!updated) return { ok: false, reason: 'not_found' };
	return {
		ok: true,
		speakerProfileId: updated.speakerProfileId,
		conferenceSpeakerId: updated.id
	};
}

/** Counts for the roster header, independent of the current filter. */
export async function speakerRosterTotals(
	conferenceId: number
): Promise<{ total: number } & Record<SpeakerStatus, number>> {
	const rows = await db
		.select({
			status: conferenceSpeakerTable.status,
			n: sql<number>`count(*)::int`
		})
		.from(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conferenceId))
		.groupBy(conferenceSpeakerTable.status);

	const counts: { total: number } & Record<SpeakerStatus, number> = {
		total: 0,
		invited: 0,
		confirmed: 0,
		declined: 0,
		cancelled: 0
	};

	for (const row of rows) {
		const status = row.status as SpeakerStatus;
		if (isSpeakerStatus(status)) {
			counts[status] = row.n;
			counts.total += row.n;
		}
	}
	return counts;
}

export type { ConferenceSpeaker };
