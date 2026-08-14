/**
 * The one place that names why a create form cannot submit (#436).
 *
 * Conference create is name-only as a requirement — slug and dates may be
 * empty. Organization create is the same question on one field. Neither
 * form is "almost all required".
 */
import { describe, expect, it } from 'vitest';
import {
	CONFERENCE_CREATE_FIELDS,
	ORGANIZATION_CREATE_FIELDS,
	createFormBlockReason
} from './create-form';

describe('createFormBlockReason', () => {
	it('names the first empty required field', () => {
		expect(createFormBlockReason([{ ...ORGANIZATION_CREATE_FIELDS.name, value: '' }])).toBe(
			'Organization Name is required.'
		);
		expect(
			createFormBlockReason([
				{ ...CONFERENCE_CREATE_FIELDS.name, value: '   ' },
				{ ...CONFERENCE_CREATE_FIELDS.slug, value: '' }
			])
		).toBe('Name is required.');
	});

	it('does not invent a requirement for optional conference fields', () => {
		expect(
			createFormBlockReason([
				{ ...CONFERENCE_CREATE_FIELDS.name, value: 'DevFlow' },
				{ ...CONFERENCE_CREATE_FIELDS.slug, value: '' },
				{ ...CONFERENCE_CREATE_FIELDS.startsOn, value: '' },
				{ ...CONFERENCE_CREATE_FIELDS.endsOn, value: '' }
			])
		).toBeNull();
	});

	it('is silent when every required field has a value', () => {
		expect(
			createFormBlockReason([{ ...ORGANIZATION_CREATE_FIELDS.name, value: 'Zen AI' }])
		).toBeNull();
	});

	it('marks only name required on conference create — the other three are optional', () => {
		expect(CONFERENCE_CREATE_FIELDS.name.required).toBe(true);
		expect(CONFERENCE_CREATE_FIELDS.slug.required).toBe(false);
		expect(CONFERENCE_CREATE_FIELDS.startsOn.required).toBe(false);
		expect(CONFERENCE_CREATE_FIELDS.endsOn.required).toBe(false);
		expect(ORGANIZATION_CREATE_FIELDS.name.required).toBe(true);
	});
});
