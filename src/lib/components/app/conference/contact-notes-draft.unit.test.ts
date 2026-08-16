import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ContactNotesDraft from './contact-notes-draft.svelte';

describe('contact notes draft', () => {
	it('posts through the notes field with the saved text', () => {
		const body = render(ContactNotesDraft, {
			props: {
				contactId: 7,
				owner: 'organizer-1',
				baseline: 'Internal note about Priya.',
				fieldId: 'notes'
			}
		}).body;

		expect(body).toContain('name="notes"');
		expect(body).toContain('id="notes"');
		expect(body).toContain('data-testid="contact-notes"');
		expect(body).toContain('Internal note about Priya.');
		expect(body).toContain('Only organizers see this.');
	});
});
