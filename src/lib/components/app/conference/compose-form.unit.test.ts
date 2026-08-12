/**
 * Compose-to-speakers form (SPK-13, organizer surface).
 *
 * Lives in a dialog on the roster page (issue #220); dialog content is
 * client-rendered only, so the form's wiring is covered here where it still
 * renders server-side.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Compose from './compose-form.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

describe('speaker compose form', () => {
	it('posts to ?/compose with subject, body and the current filter', () => {
		const { body } = render(Compose, {
			props: {
				recipients: 1,
				filtered: true,
				filters: { q: 'ada', status: 'confirmed' },
				busy: false,
				enhanceForm: (() => ({})) as never,
				form: null
			}
		});

		expect(body).toContain('action="?/compose"');
		expect(body).toContain('1 recipient with an email address');
		expect(body).toContain('in the current filter');
		expect(body).toContain('name="q" value="ada"');
		expect(body).toContain('name="status" value="confirmed"');
		expect(body).toContain('data-testid="speaker-mail-subject"');
		expect(body).toContain('data-testid="speaker-mail-body"');
		expect(body).toContain('Send to 1 speaker');
	});

	it('drops the filter clause and pluralises correctly when unfiltered', () => {
		const { body } = render(Compose, {
			props: {
				recipients: 2,
				filtered: false,
				filters: {},
				busy: false,
				enhanceForm: (() => ({})) as never,
				form: null
			}
		});

		expect(body).toContain('2 recipients with an email address');
		expect(body).not.toContain('in the current filter');
		expect(body).toContain('Send to 2 speakers');
	});

	it('renders a scoped compose error in place, so it is not lost behind the dialog', () => {
		const { body } = render(Compose, {
			props: {
				recipients: 0,
				filtered: false,
				filters: {},
				busy: false,
				enhanceForm: (() => ({})) as never,
				form: { scope: 'compose', error: 'No speakers in this filter have an email address.' }
			}
		});

		expect(body).toContain('data-testid="compose-error"');
		expect(body).toContain('No speakers in this filter have an email address.');
	});
});
