/** The field editor parks a typed label (#766). */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Editor from './cfp-field-editor.svelte';

describe('cfp field editor label (#766)', () => {
	it('posts the label through a named input', () => {
		const body = render(Editor, {
			props: {
				field: null,
				fields: [],
				formats: [],
				tracks: [],
				owner: 'user-1',
				conferenceSlug: 'demo'
			}
		}).body;

		expect(body).toContain('name="label"');
		expect(body).toContain('data-testid="cfp-field-label"');
		expect(body).toContain('aria-label="Label"');
	});
});
