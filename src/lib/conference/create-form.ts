/**
 * What a create form wants (#436).
 *
 * `/manage/new` and `/settings/organization/new` both know which fields are
 * required — `required` in the markup, a server check, a disabled submit —
 * and neither says so out loud. The person filling them in should not have
 * to click a dead button to find out.
 *
 * The specs live here so the two pages cannot each decide that Name is
 * required. **Whatever this returns a reason for is refused on the server**
 * (conference create) or not sent (organization create). A hidden `required`
 * attribute is not a label.
 *
 * These forms are not almost-all-required. Conference create asks for one
 * required field (name) and three optional ones (address, dates). Organization
 * create asks for one required field. The visible marker is therefore on the
 * required fields, the same `*` the proposal form already uses.
 */

export type CreateFormField = {
	label: string;
	required: boolean;
	value: string;
};

export const CONFERENCE_CREATE_FIELDS = {
	name: { label: 'Name', required: true },
	slug: { label: 'Public address', required: false },
	startsOn: { label: 'Starts', required: false },
	endsOn: { label: 'Ends', required: false }
} as const;

export const ORGANIZATION_CREATE_FIELDS = {
	name: { label: 'Organization Name', required: true }
} as const;

/** First required field that is still empty. `null` when the form may submit. */
export function createFormBlockReason(fields: CreateFormField[]): string | null {
	const missing = fields.find((field) => field.required && field.value.trim() === '');
	return missing ? `${missing.label} is required.` : null;
}
