import { clearBrowserDraft } from '$lib/forms/browser-draft';
import { browserDraftLeavePrompt } from './browser-draft-copy';

/** Typed fields on the add-speaker dialog. Status is chosen, not typed. */
export const NEW_SPEAKER_FIELDS = ['name', 'email', 'jobTitle', 'company', 'bio'] as const;

/** Typed fields on the roster row. Notes keep `speakerNotesDraftScope`. */
export const SPEAKER_ROW_FIELDS = [
	'name',
	'email',
	'sortName',
	'jobTitle',
	'company',
	'bio'
] as const;

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

/** Paste box on the roster import dialog. Not the contacts import. */
export function speakerImportCsvScope(slug: string): string {
	return `speaker-import-csv:${slug}`;
}

/** Every parked key on an open roster row, including the #759 notes copy. */
export function speakerRowDraftScopes(slug: string, speakerProfileId: number): string[] {
	return [
		...SPEAKER_ROW_FIELDS.map((field) => speakerFieldScope(slug, speakerProfileId, field)),
		speakerNotesDraftScope(slug, speakerProfileId)
	];
}

/** Drop the row's parked fields after a successful save. */
export function clearSpeakerRowDrafts(
	storage: Pick<Storage, 'removeItem'>,
	slug: string,
	speakerProfileId: number,
	owner: string
): void {
	for (const scope of speakerRowDraftScopes(slug, speakerProfileId)) {
		clearBrowserDraft(storage, scope, owner);
	}
}

/**
 * Leave prompt for the open roster row. Names what `dirty` tracks.
 * Does not say the page is saved. The add dialog has no guard — close is
 * not a navigation, and the draft is the fix.
 */
export const SPEAKER_ROW_LEAVE_PROMPT = browserDraftLeavePrompt('what you typed on this speaker');
