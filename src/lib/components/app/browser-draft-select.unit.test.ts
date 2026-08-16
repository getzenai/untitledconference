/** A named dropdown that can park a chosen value (#801). */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrowserDraftSelect from './browser-draft-select.svelte';

describe('browser draft select', () => {
	it('posts through a named field with the app-select hook', () => {
		const body = render(BrowserDraftSelect, {
			props: {
				scope: 'cfp-autosave:devflow:sessionFormatId',
				owner: 'anonymous',
				baseline: '',
				name: 'sessionFormatId',
				value: '1',
				options: [
					{ value: '', label: '—' },
					{ value: '1', label: 'Keynote (45 min)' }
				]
			}
		}).body;

		expect(body).toContain('name="sessionFormatId"');
		expect(body).toContain('data-testid="app-select-sessionFormatId"');
		expect(body).toMatch(/value="1"[^>]*name="sessionFormatId"/);
		expect(body).toContain('Keynote (45 min)');
	});
});
