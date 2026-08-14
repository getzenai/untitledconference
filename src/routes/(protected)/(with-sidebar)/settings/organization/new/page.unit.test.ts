/**
 * #436: the organization create form greys Create when the name is empty
 * and used to say nothing about it.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$lib/auth-client', () => ({
	authClient: { organization: { create: vi.fn(), setActive: vi.fn() } }
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

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
});
