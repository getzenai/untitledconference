/**
 * Organizer tags on a speaker profile (CRM-04).
 *
 * Stored as a JSON string array on `speaker_profile.tags`, same text-column
 * pattern as `links`. Pure helpers so the form and the server agree on shape.
 */

/** Hard cap so a paste of a paragraph cannot become a tag cloud. */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** Reads the stored column. Unparseable values become an empty list. */
export function parseSpeakerTags(raw: string | null | undefined): string[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// A free-text column that once held something else: treat as no tags
		// rather than 500 the directory over a dirty row.
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	const seen = new Set<string>();
	const tags: string[] = [];
	for (const entry of parsed) {
		if (typeof entry !== 'string') continue;
		const tag = entry.trim().slice(0, MAX_TAG_LENGTH);
		if (!tag) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		tags.push(tag);
		if (tags.length >= MAX_TAGS) break;
	}
	return tags;
}

/** Serializes for storage. Empty list becomes null so "no tags" is one state. */
export function serializeSpeakerTags(tags: string[]): string | null {
	const normalized = parseSpeakerTags(JSON.stringify(tags));
	return normalized.length === 0 ? null : JSON.stringify(normalized);
}

/**
 * Accepts a free-text field from a form ("vip, keynote" or one tag per line)
 * and turns it into the stored list.
 */
export function tagsFromFormInput(raw: string | null | undefined): string[] {
	if (raw == null) return [];
	const pieces = raw
		.split(/[\n,]+/)
		.map((part) => part.trim())
		.filter(Boolean);
	return parseSpeakerTags(JSON.stringify(pieces));
}
