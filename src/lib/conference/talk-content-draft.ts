/**
 * The organizer's talk-edit fields as a serializable snapshot (#760).
 *
 * Storage is `$lib/forms/browser-draft`. This file only knows what a talk
 * draft looks like and which typed values a Save would keep.
 */

import { titleLengthError } from './proposal-limits';

export type TalkContentDraft = {
	title: string;
	abstract: string;
	keyTakeaway: string;
	audienceLevel: string;
};

export function talkContentDraftScope(slug: string, submissionId: number): string {
	return `talk-content:${slug}:${submissionId}`;
}

export function talkContentBaseline(saved: TalkContentDraft): string {
	return JSON.stringify([saved.title, saved.abstract, saved.keyTakeaway, saved.audienceLevel]);
}

export function sameTalkContent(a: TalkContentDraft, b: TalkContentDraft): boolean {
	return (
		a.title === b.title &&
		a.abstract === b.abstract &&
		a.keyTakeaway === b.keyTakeaway &&
		a.audienceLevel === b.audienceLevel
	);
}

/**
 * What a Save would keep from this typing.
 *
 * An empty or overlong title, or an emptied abstract on a submitted talk, is
 * not a draft — restoring it would look like a saved talk. Everything the
 * action would accept stays.
 */
export function parkableTalkContent(
	typed: TalkContentDraft,
	saved: TalkContentDraft,
	status: string
): TalkContentDraft {
	const title = typed.title.trim();
	const titleRejected = !title || titleLengthError(typed.title) !== null;
	const abstractRejected = !typed.abstract.trim() && Boolean(saved.abstract) && status !== 'draft';
	return {
		title: titleRejected ? saved.title : typed.title,
		abstract: abstractRejected ? saved.abstract : typed.abstract,
		keyTakeaway: typed.keyTakeaway,
		audienceLevel: typed.audienceLevel
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function parseTalkContentDraft(value: unknown): TalkContentDraft | null {
	const row = asRecord(value);
	if (!row) return null;
	if (
		typeof row.title !== 'string' ||
		typeof row.abstract !== 'string' ||
		typeof row.keyTakeaway !== 'string' ||
		typeof row.audienceLevel !== 'string'
	) {
		return null;
	}
	return {
		title: row.title,
		abstract: row.abstract,
		keyTakeaway: row.keyTakeaway,
		audienceLevel: row.audienceLevel
	};
}
