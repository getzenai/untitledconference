/**
 * Organization settings (#440): one real role picker, no test-only control
 * in the production DOM.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

const owner = {
	id: 'member-1',
	userId: 'user-1',
	role: 'owner',
	user: { email: 'jordan@example.test' }
};

const data = {
	user: { id: 'user-1', email: 'jordan@example.test', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined },
	organization: { id: 'org-1', name: 'Acme Events', slug: 'acme' },
	currentMember: owner,
	members: [owner],
	invitations: []
};

function body() {
	return render(Page, { props: { data: data as never, form: null } }).body;
}

describe('organization settings page', () => {
	it('exposes exactly one invite-role picker and no test-only select', () => {
		const html = body();

		expect(html).toContain('id="inviteRole"');
		expect(html).not.toContain('Role for testing');
		expect(html).not.toMatch(/<select[\s>]/);

		const triggers = html.match(/id="inviteRole"/g) ?? [];
		expect(triggers).toHaveLength(1);
	});
});
