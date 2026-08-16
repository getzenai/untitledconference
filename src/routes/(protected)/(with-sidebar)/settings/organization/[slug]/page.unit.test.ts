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

// `beforeNavigate` comes with the unsaved-work guard (#761).
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(),
	beforeNavigate: vi.fn()
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
	invitations: [],
	aiSettings: { configured: false }
};

function body() {
	return render(Page, { props: { data: data as never, form: null } }).body;
}

describe('organization settings page', () => {
	it('keeps the organization name in a draftable field (#761)', () => {
		const html = body();
		expect(html).toContain('id="organization-name"');
		expect(html).toContain('name="name"');
		expect(html).toContain('data-testid="organization-name"');
	});

	it('exposes exactly one invite-role picker and no test-only select', () => {
		const html = body();

		expect(html).toContain('id="inviteRole"');
		expect(html).not.toContain('Role for testing');
		expect(html).not.toMatch(/<select[\s>]/);

		const triggers = html.match(/id="inviteRole"/g) ?? [];
		expect(triggers).toHaveLength(1);
	});

	it('shows the chat-backend card and never re-renders a saved key', () => {
		const configured = {
			...data,
			aiSettings: {
				configured: true,
				baseUrl: 'https://api.openai.com/v1',
				apiKeySuffix: '7f3a',
				modelId: 'openai/gpt-4o'
			}
		};
		const html = render(Page, { props: { data: configured as never, form: null } }).body;
		expect(html).toContain('Chat backend');
		expect(html).toContain('Key ending in 7f3a');
		expect(html).toContain('https://api.openai.com/v1');
		expect(html).not.toContain('sk-');
		expect(html).toMatch(/id="org-ai-api-key"/);
		expect(html).not.toMatch(/id="org-ai-api-key"[^>]*value="[^"]+/);
	});

	/**
	 * The scope of the address check is stated where the address is typed (#741).
	 *
	 * The assertion is on the two halves rather than the whole sentence: that we
	 * say what we do, and that we say what is left over. A wording change should
	 * be free; dropping either half should not be.
	 */
	it('says under the backend URL what the check covers and what it does not', () => {
		const configured = {
			...data,
			aiSettings: {
				configured: true,
				baseUrl: 'https://api.openai.com/v1',
				apiKeySuffix: '7f3a',
				modelId: 'openai/gpt-4o'
			}
		};
		const html = render(Page, { props: { data: configured as never, form: null } }).body;
		// The markup wraps, so match the claim rather than the line breaks.
		const text = html.replace(/\s+/g, ' ');

		expect(html).toMatch(/id="org-ai-base-url-scope"/);
		expect(html).toMatch(/aria-describedby="org-ai-base-url-scope"/);
		// What we check.
		expect(text).toContain('resolves inside a private network is refused');
		// What we cannot, said as a fact about the backend rather than a disclaimer.
		expect(text).toContain('between the check and the connection');
		expect(text).not.toMatch(/no liability|not responsible|at your own risk/i);
	});

	it('tells a member only whether a backend is configured', () => {
		const member = {
			id: 'member-2',
			userId: 'user-2',
			role: 'member',
			user: { email: 'alex@example.test' }
		};
		const html = render(Page, {
			props: {
				data: {
					...data,
					user: { id: 'user-2', email: 'alex@example.test', name: 'Alex' },
					currentMember: member,
					members: [owner, member],
					aiSettings: { configured: true }
				} as never,
				form: null
			}
		}).body;
		expect(html).toContain('This organization uses its own chat backend.');
		expect(html).not.toContain('id="org-ai-api-key"');
		expect(html).not.toContain('7f3a');
	});
});
