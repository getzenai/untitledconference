import { browserDraftLeavePrompt } from './browser-draft-copy';

/** Single-line fields on the add-speaker dialog. Bio stays a plain textarea. */
export const NEW_SPEAKER_FIELDS = ['name', 'email', 'jobTitle', 'company'] as const;

/** Single-line fields on the roster row. Notes keep `speakerNotesDraftScope`. */
export const SPEAKER_ROW_FIELDS = ['name', 'email', 'sortName', 'jobTitle', 'company'] as const;

/** Scope for one parked field on a roster row. */
export function speakerFieldScope(slug: string, speakerProfileId: number, field: string): string {
	return `speaker-${field}:${slug}:${speakerProfileId}`;
}

/** Scope for the speaker-row internal notes safety copy (#759). */
export function speakerNotesDraftScope(slug: string, speakerProfileId: number): string {
	return speakerFieldScope(slug, speakerProfileId, 'notes');
}

/** Scope for one parked field on the add-speaker dialog. No profile id yet. */
export function newSpeakerFieldScope(slug: string, field: string): string {
	return `speaker-new:${slug}:${field}`;
}

/**
 * Leave prompt for the open roster row. Names what `dirty` tracks.
 * Does not say the page is saved. The add dialog has no guard — close is
 * not a navigation, and the draft is the fix.
 */
export const SPEAKER_ROW_LEAVE_PROMPT = browserDraftLeavePrompt('what you typed on this speaker');
