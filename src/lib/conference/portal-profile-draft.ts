/**
 * The speaker's own portal profile as parked fields (#789).
 *
 * One key per field, scoped to the profile id — two organizations mean two
 * rows, and a typed bio on one must not land in the other. The prefix is
 * `portal-`, not `speaker-` (roster) or `contact-` (CRM).
 *
 * The headshot picker is a file input and is not parked. Email is not a field
 * on this page.
 */
import { browserDraftLeavePrompt } from './browser-draft-copy';
import { SPEAKER_LINK_ROWS } from './speaker-links';

export const PORTAL_PROFILE_TEXT_FIELDS = [
	'name',
	'sortName',
	'jobTitle',
	'company',
	'bio'
] as const;

/** Label + URL for every row the form draws. */
export const PORTAL_PROFILE_LINK_FIELDS = Array.from(
	{ length: SPEAKER_LINK_ROWS },
	(_, i) => [`linkLabel${i}`, `linkUrl${i}`] as const
).flat();

export const PORTAL_PROFILE_FIELDS = [
	...PORTAL_PROFILE_TEXT_FIELDS,
	...PORTAL_PROFILE_LINK_FIELDS
] as const;

export function portalProfileFieldScope(profileId: number, field: string): string {
	return `portal-${field}:${profileId}`;
}

/** Every parked key on one profile. Two ids share no string. */
export function portalProfileDraftScopes(profileId: number): string[] {
	return PORTAL_PROFILE_FIELDS.map((field) => portalProfileFieldScope(profileId, field));
}

/**
 * Leave prompt for the whole profile. Names what `dirty` tracks.
 * Does not say the page is saved.
 */
export const PORTAL_PROFILE_LEAVE_PROMPT = browserDraftLeavePrompt(
	'what you typed on this profile'
);
