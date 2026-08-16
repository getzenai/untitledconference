/**
 * Speaker-list import form (SPK-03 / CRM-05).
 *
 * Shared by the roster page and the contacts page. On the roster page it now
 * renders inside a dialog (issue #220); dialog content is client-rendered only,
 * so this component is tested directly where it still renders server-side.
 */
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import ImportForm from './speaker-import.svelte';

const source = readFileSync(new URL('./speaker-import.svelte', import.meta.url), 'utf8');

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const props = {
	busy: false,
	owner: 'ada',
	scope: 'speaker-import-csv:devflow',
	enhanceForm: (() => ({})) as never
};

describe('speaker import form', () => {
	it('offers both ways into an import: a file and a paste box, one action', () => {
		const { body } = render(ImportForm, { props: { ...props, form: null } });

		expect(body).toContain('data-testid="speakers-import"');
		expect(body).toContain('action="?/import"');
		expect(body).toContain('enctype="multipart/form-data"');
		expect(body).toContain('data-testid="import-file"');
		expect(body).toContain('data-testid="import-csv"');
		expect(body).toContain('sending the same file twice is safe');
		expect(body).toContain('Check the email column');
		expect(body).not.toContain('a name is not an identity');
		expect(body).toContain('Import speakers');
	});

	it('lets Contacts rename the button without changing the roster default (#455)', () => {
		const { body } = render(ImportForm, {
			props: { ...props, form: null, submitLabel: 'Import contacts' }
		});

		expect(body).toContain('Import contacts');
		expect(body).not.toContain('Import speakers');
	});

	it('answers an import in place, not through the page banner', () => {
		const { body } = render(ImportForm, {
			props: { ...props, form: { scope: 'import', message: 'Imported 12 speakers.' } } as never
		});

		expect(body).toContain('data-testid="import-message"');
		expect(body).toContain('Imported 12 speakers.');
	});

	it('parks the paste box and leaves the file picker alone (#789)', () => {
		expect(source).toContain('BrowserDraftInput');
		expect(source).toContain('testId="import-csv"');
		expect(source).toContain('baseline=""');
		expect(source).not.toContain('<textarea');
		expect(source).toContain('type="file"');
		expect(source).not.toContain("from '$lib/components/app/unsaved-guard.svelte'");
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
