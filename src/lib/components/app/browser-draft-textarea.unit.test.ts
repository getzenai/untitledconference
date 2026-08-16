/** New-lines field: `baseline` is the saved list, `initial` is what shows (#812). */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrowserDraftTextarea from './browser-draft-textarea.svelte';

describe('browser draft textarea', () => {
	it('starts empty when baseline is the saved list', () => {
		const roomsJson = JSON.stringify([{ id: 1, name: 'Main hall' }]);
		const body = render(BrowserDraftTextarea, {
			props: {
				draftId: 'rooms',
				scope: 'settings:rooms',
				owner: 'user-1',
				baseline: roomsJson,
				initial: '',
				name: 'names',
				label: 'New rooms — one per line',
				testId: 'settings-new-rooms',
				commitToken: 0,
				ondirtychange: () => {}
			}
		}).body;

		expect(body).toContain('<textarea');
		expect(body).toContain('name="names"');
		expect(body).toContain('data-testid="settings-new-rooms"');
		expect(body).toContain('New rooms — one per line');
		expect(body).not.toContain('Main hall');
		expect(body).not.toContain(roomsJson);
	});
});
