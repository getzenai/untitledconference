/**
 * Add-a-speaker form (SPK-02, organizer surface).
 *
 * Lives in a dialog on the roster page (issue #220); dialog content is
 * client-rendered only, so the form's wiring is covered here where it still
 * renders server-side.
 */
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import AddForm from './add-speaker-form.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const source = readFileSync(new URL('./add-speaker-form.svelte', import.meta.url), 'utf8');

const statusOptions = [
	{ value: 'invited', label: 'invited' },
	{ value: 'confirmed', label: 'confirmed' },
	{ value: 'declined', label: 'declined' },
	{ value: 'cancelled', label: 'cancelled' }
];

const baseProps = {
	slug: 'devflow',
	owner: 'ada',
	statusOptions,
	busy: false,
	enhanceForm: (() => ({})) as never,
	form: null
};

describe('add speaker form', () => {
	it('posts to ?/add with every roster field and a default status', () => {
		const { body } = render(AddForm, { props: baseProps });

		expect(body).toContain('action="?/add"');
		expect(body).toContain('data-testid="add-name"');
		expect(body).toContain('data-testid="add-email"');
		expect(body).toContain('data-testid="add-status"');
		expect(body).toContain('data-testid="add-jobTitle"');
		expect(body).toContain('data-testid="add-company"');
		expect(body).toContain('data-testid="add-bio"');
		expect(body).toContain('Add to roster');
	});

	it('renders a scoped add error in place, so it is not lost behind the dialog', () => {
		const { body } = render(AddForm, {
			props: {
				...baseProps,
				form: { scope: 'add', error: 'That speaker is already on this conference roster.' }
			}
		});

		expect(body).toContain('data-testid="add-error"');
		expect(body).toContain('That speaker is already on this conference roster.');
	});

	it('parks the typed fields, including bio, with BrowserDraftInput and no leave prompt', () => {
		expect(source).toContain('BrowserDraftInput');
		expect(source).toContain('newSpeakerFieldScope');
		expect(source).toContain('NEW_SPEAKER_FIELDS');
		expect(source).toContain('scopes.bio');
		expect(source).toContain('rows={2}');
		expect(source).not.toContain("from '$lib/components/app/unsaved-guard.svelte'");
	});
});
