/**
 * Reads a proposal out of a submitted form.
 *
 * Shared by the two routes that accept one — the public call and the portal's
 * edit page — because a second parser is a second set of field names to keep in
 * step with the single form component that produces them.
 */
import type { SubmissionInput } from './cfp-submission';

/** `''` and `'null'` both mean "not chosen" once a select has been through a post. */
function optionalNumber(value: FormDataEntryValue | null): number | null {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!text || text === 'null') return null;
	const parsed = Number(text);
	return Number.isInteger(parsed) ? parsed : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
	const text = typeof value === 'string' ? value.trim() : '';
	return text || null;
}

function text(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Answers arrive as `answer:<fieldId>`, co-presenters as parallel `co-name` /
 * `co-email` / `co-role` lists. Reading answers by name rather than by index is
 * what keeps a removed row from pairing the wrong email with the wrong person.
 */
export function readProposal(data: FormData): SubmissionInput {
	const answers: Record<number, string> = {};
	for (const [key, value] of data.entries()) {
		if (!key.startsWith('answer:') || typeof value !== 'string') continue;
		const fieldId = Number(key.slice('answer:'.length));
		if (Number.isInteger(fieldId)) answers[fieldId] = value.trim();
	}

	const names = data.getAll('co-name').map((v) => text(v));
	const emails = data.getAll('co-email');
	const roles = data.getAll('co-role');
	const coSpeakers = names
		.map((name, i) => ({
			name,
			email: optionalText(emails[i] ?? null),
			roleLabel: optionalText(roles[i] ?? null)
		}))
		.filter((co) => co.name);

	return {
		title: text(data.get('title')),
		abstract: optionalText(data.get('abstract')),
		keyTakeaway: optionalText(data.get('keyTakeaway')),
		audienceLevel: optionalText(data.get('audienceLevel')),
		sessionFormatId: optionalNumber(data.get('sessionFormatId')),
		trackId: optionalNumber(data.get('trackId')),
		answers,
		speaker: {
			name: text(data.get('speakerName')),
			sortName: text(data.get('speakerSortName')),
			email: text(data.get('speakerEmail')),
			jobTitle: optionalText(data.get('speakerJobTitle')),
			company: optionalText(data.get('speakerCompany')),
			bio: optionalText(data.get('speakerBio'))
		},
		coSpeakers
	};
}
