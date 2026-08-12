/**
 * Speaker-list import form (SPK-03 / CRM-05).
 *
 * Shared by the roster page and the contacts page. On the roster page it now
 * renders inside a dialog (issue #220); dialog content is client-rendered only,
 * so this component is tested directly where it still renders server-side.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import ImportForm from './speaker-import.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const props = { busy: false, enhanceForm: (() => ({})) as never };

describe('speaker import form', () => {
	it('offers both ways into an import: a file and a paste box, one action', () => {
		const { body } = render(ImportForm, { props: { ...props, form: null } });

		expect(body).toContain('data-testid="speakers-import"');
		expect(body).toContain('action="?/import"');
		expect(body).toContain('enctype="multipart/form-data"');
		expect(body).toContain('data-testid="import-file"');
		expect(body).toContain('data-testid="import-csv"');
	});

	it('answers an import in place, not through the page banner', () => {
		const { body } = render(ImportForm, {
			props: { ...props, form: { scope: 'import', message: 'Imported 12 speakers.' } } as never
		});

		expect(body).toContain('data-testid="import-message"');
		expect(body).toContain('Imported 12 speakers.');
	});

	it('renders a refused import as an alert in the same place', () => {
		const { body } = render(ImportForm, {
			props: {
				...props,
				form: { scope: 'import', error: 'Row 7 has no name. Every speaker needs one.' }
			} as never
		});

		expect(body).toContain('data-testid="import-error"');
		expect(body).toContain('Row 7 has no name.');
	});
});
