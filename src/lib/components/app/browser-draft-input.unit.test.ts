/** A named input that can park a typed value (#761). */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrowserDraftInput from './browser-draft-input.svelte';

describe('browser draft input', () => {
	it('posts through a named field with a test id', () => {
		const body = render(BrowserDraftInput, {
			props: {
				scope: 'organization-name:org-1',
				owner: 'user-1',
				baseline: 'Acme',
				name: 'name',
				id: 'organization-name',
				testId: 'organization-name',
				required: true
			}
		}).body;

		expect(body).toContain('name="name"');
		expect(body).toContain('id="organization-name"');
		expect(body).toContain('data-testid="organization-name"');
		expect(body).toContain('value="Acme"');
	});

	it('can be an email field', () => {
		const body = render(BrowserDraftInput, {
			props: {
				scope: 'reviewer-invite:devflow',
				owner: 'user-1',
				baseline: '',
				name: 'email',
				type: 'email',
				testId: 'people-invite-email',
				required: true
			}
		}).body;

		expect(body).toContain('name="email"');
		expect(body).toContain('type="email"');
		expect(body).toContain('data-testid="people-invite-email"');
	});
});
