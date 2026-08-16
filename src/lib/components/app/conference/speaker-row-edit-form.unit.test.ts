/**
 * Open roster-row form. The page only mounts this when Edit is open, so the
 * wiring is covered here where it still renders server-side.
 */
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Form from './speaker-row-edit-form.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const source = readFileSync(new URL('./speaker-row-edit-form.svelte', import.meta.url), 'utf8');

const speaker = {
	speakerProfileId: 5,
	name: 'Priya Raman',
	email: 'priya@example.com',
	sortName: 'Raman, Priya',
	jobTitle: 'Staff Engineer',
	company: 'Acme',
	bio: 'Builds things.',
	notes: null
};

describe('speaker row edit form', () => {
	it('posts the saved bio through a parked textarea, not a bare field', () => {
		const { body } = render(Form, {
			props: {
				slug: 'devflow',
				owner: 'ada',
				speaker,
				busy: false,
				enhanceForm: (() => ({})) as never,
				ondirtychange: () => {}
			}
		});

		expect(body).toContain('action="?/updateProfile"');
		expect(body).toContain('data-testid="edit-bio"');
		expect(body).toContain('Builds things.');
		expect(body).toContain('<textarea');
		expect(source).toContain('speakerFieldScope');
		expect(source).toContain('rows={3}');
		expect(source).toContain("field('bio')");
		expect(source).toContain("initial={speaker.bio ?? ''}");
		expect(source).toContain("baseline={speaker.bio ?? ''}");
	});
});
