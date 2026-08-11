/**
 * The speaker's own profile, editable outside a proposal (SPK-08).
 *
 * Until this module existed, `speaker_profile` could only be written by writing
 * a proposal: `upsertOwnProfile` in `cfp-submission.ts` folds the "About you"
 * fields in on every draft save. That made the profile a side effect of having
 * an unsubmitted draft — a speaker whose only proposal was accepted (and is
 * therefore no longer a draft) had no way to fix their own bio, while a task
 * told them to complete it.
 *
 * The authorization model is the one `speaker-portal.ts` already uses and for
 * the same reason: `userId` is in the `where` of every statement, so a profile
 * that is not yours is not selected and not updated. There is no moment where
 * the wrong row is in memory and something downstream has to remember to drop
 * it.
 */
import { serializeSpeakerLinks, type SpeakerLink } from '$lib/conference/speaker-links';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, eq } from 'drizzle-orm';
import { claimProfilesForAccount } from './speaker-portal';

export type OwnProfile = {
	id: number;
	organizationId: string;
	organizationName: string;
	name: string;
	sortName: string;
	email: string | null;
	jobTitle: string | null;
	company: string | null;
	bio: string | null;
	links: string | null;
	headshotUrl: string | null;
};

/**
 * Every profile this account speaks under, one per organization.
 *
 * More than one is normal, not an edge case: the profile is org-wide by design
 * (it is the cross-event speaker directory), so someone who has spoken for two
 * different organizers genuinely has two, and may well want a different bio in
 * each. The page draws a form per row rather than merging them into one.
 *
 * The claim runs first for the same reason it runs on the portal's other reads:
 * the moment a profile becomes yours is the moment someone else named you as a
 * co-speaker, which no sign-in hook can observe.
 */
export async function myProfiles(userId: string): Promise<OwnProfile[]> {
	await claimProfilesForAccount(userId);

	return db
		.select({
			id: speakerProfileTable.id,
			organizationId: speakerProfileTable.organizationId,
			organizationName: organization.name,
			name: speakerProfileTable.name,
			sortName: speakerProfileTable.sortName,
			email: speakerProfileTable.email,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			bio: speakerProfileTable.bio,
			links: speakerProfileTable.links,
			headshotUrl: speakerProfileTable.headshotUrl
		})
		.from(speakerProfileTable)
		.innerJoin(organization, eq(organization.id, speakerProfileTable.organizationId))
		.where(eq(speakerProfileTable.userId, userId))
		.orderBy(asc(organization.name));
}

export type ProfileEdit = {
	name: string;
	sortName: string;
	jobTitle: string;
	company: string;
	bio: string;
	links: SpeakerLink[];
};

/**
 * Writes the fields a speaker owns about themselves.
 *
 * `email` is deliberately not among them. The address on the profile is what
 * `claimProfilesForAccount` matches an unclaimed profile against, so letting it
 * be typed here would turn this form into "claim the profile belonging to
 * whoever I say I am" — the same trap `upsertOwnProfile` avoids by matching on
 * the account's address rather than the one in the form.
 *
 * Optional fields are cleared when blank. Unlike a draft save, where an empty
 * box is an unfinished form, this page has no other state: the only way to
 * remove a company you no longer work for is to empty the field and save.
 *
 * Returns false when nothing was updated, which covers both "no such profile"
 * and "not yours" — the caller has no business telling those apart.
 */
export async function updateOwnProfile(
	userId: string,
	profileId: number,
	edit: ProfileEdit
): Promise<boolean> {
	const name = edit.name.trim();
	if (!name) return false;

	const updated = await db
		.update(speakerProfileTable)
		.set({
			name,
			sortName: edit.sortName.trim() || name,
			jobTitle: edit.jobTitle.trim() || null,
			company: edit.company.trim() || null,
			bio: edit.bio.trim() || null,
			links: serializeSpeakerLinks(edit.links)
		})
		.where(and(eq(speakerProfileTable.id, profileId), eq(speakerProfileTable.userId, userId)))
		.returning({ id: speakerProfileTable.id });

	return updated.length > 0;
}

/**
 * Where a speaker's headshot lives in the bucket.
 *
 * One key per profile, overwritten on re-upload rather than versioned. A
 * deliverable is evidence and keeps its history; a headshot is a current fact
 * about a person, and the previous one has no reader.
 */
export function headshotObjectKey(profileId: number): string {
	return `speaker-headshot/${profileId}`;
}

/** The app path that renders the stored object. Public by design — see the route. */
export function headshotHref(profileId: number, version: number): string {
	// The version defeats the cache when someone replaces their photo; without it
	// the old face survives in every browser that has already seen it.
	return `/speaker-photo/${profileId}?v=${version}`;
}

/**
 * Whether this profile is this account's.
 *
 * Asked on its own only by the headshot upload, which needs the answer *before*
 * it writes: the object key is derived from the profile id, so putting bytes
 * first would let anyone who guesses an id overwrite somebody else's face. Every
 * other write here gets the same guarantee for free by carrying `userId` in its
 * own `where`.
 */
export async function ownsProfile(userId: string, profileId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(and(eq(speakerProfileTable.id, profileId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	return row !== undefined;
}

/** Points the profile at its uploaded headshot, or clears it. Same ownership rule. */
export async function setOwnHeadshot(
	userId: string,
	profileId: number,
	href: string | null
): Promise<boolean> {
	const updated = await db
		.update(speakerProfileTable)
		.set({ headshotUrl: href })
		.where(and(eq(speakerProfileTable.id, profileId), eq(speakerProfileTable.userId, userId)))
		.returning({ id: speakerProfileTable.id });

	return updated.length > 0;
}

/**
 * Whether this profile's headshot may be served to anyone who asks.
 *
 * The uploads bucket is otherwise entirely private, and deliberately so — the
 * download route in the portal exists precisely because a slide deck is not
 * public data. A headshot is the one file a speaker uploads *in order to* be
 * looked at, but that is only true once they are actually on the programme.
 *
 * So the gate here is the same predicate `public-conference.ts` uses to decide
 * what the public site shows at all: a confirmed placement of an accepted,
 * content-approved submission. A speaker whose talk was rejected has a stored
 * headshot and no public page, and their photo stays unreadable — which is what
 * the comment on `selectSpeakersFor` is already careful about for bios.
 */
export async function headshotIsPublic(profileId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: placementTable.id })
		.from(submissionSpeakerTable)
		.innerJoin(submissionTable, eq(submissionTable.id, submissionSpeakerTable.submissionId))
		.innerJoin(placementTable, eq(placementTable.submissionId, submissionTable.id))
		.where(
			and(
				eq(submissionSpeakerTable.speakerProfileId, profileId),
				eq(placementTable.status, 'confirmed'),
				eq(submissionTable.status, 'accepted'),
				eq(submissionTable.contentApproval, 'approved')
			)
		)
		.limit(1);

	return row !== undefined;
}
