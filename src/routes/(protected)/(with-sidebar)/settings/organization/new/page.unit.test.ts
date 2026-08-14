/**
 * #436: the organization create form greys Create when the name is empty
 * and used to say nothing about it.
 *
 * #485: the page shipped no <form>, so Enter in the name field did nothing.
 * The field and the button have to live in one, and the button has to be
 * type="submit" — `Button` defaults to type="button".
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$lib/auth-client', () => ({
	authClient: { organization: { create: vi.fn(), setActive: vi.fn() } }
}));

// `beforeNavigate` comes with the unsaved-work guard (#435), which the page
// mounts. It registers a callback and returns nothing, so a no-op is the whole
// contract here; whether the guard asks the right question is tested next to it.
vi.mock('$app/navigation', () => ({ goto: vi.fn(), beforeNavigate: vi.fn() }));

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn() } }));

function body() {
	return render(Page, {
		props: {
			data: {
				user: { id: 'owner-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined }
			} as never
		}
	}).body;
}

describe('new organization', () => {
	it('marks Organization Name required and names why Create is grey', () => {
		const html = body();

		expect(html).toContain('Organization Name');
		expect(html).toMatch(/Organization Name<!--[^>]*--><span class="text-status-bad">\u00a0\*/);
		expect(html).toContain('data-testid="create-block-reason"');
		expect(html).toContain('Organization Name is required.');
		expect(html).toMatch(/disabled[^>]*>[\s\S]*Create Organization/);
	});

	it('is a form, so Enter in the name field creates the organization', () => {
		const html = body();

		expect(html).toContain('data-testid="create-organization-form"');
		expect(html).toMatch(/<form[^>]*data-testid="create-organization-form"/);
		expect(html).toContain('type="submit"');
	});
});
