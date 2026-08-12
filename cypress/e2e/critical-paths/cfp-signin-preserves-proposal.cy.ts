/**
 * A signed-out visitor who fills the call and clicks "Sign in to submit"
 * must not come back to an empty form (#236).
 *
 * The button used to be a GET to /login. Every field lived only in the
 * component, so login dropped the draft with no message. The product promise
 * is the opposite: the click said submit, so after sign-in the proposal exists
 * on the Speaking tab.
 */
import { DEFAULT_TEST_PASSWORD } from '../../support/globals';

const uniqueSlug = () => `cfp-signin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Signing in from the public call', () => {
	it('sends the proposal that was filled in before the account', () => {
		const slug = uniqueSlug();
		const title = `Batching without tears ${Date.now()}`;

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.logout();

		cy.createTestUser().then((speaker) => {
			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();

			cy.get('input[name="title"]').clear().type(title);
			cy.get('textarea[name="abstract"]').clear().type('How we stopped copying the queue.');
			cy.get('input[name="speakerName"]').clear().type('Ada Bennett');
			cy.get('input[name="speakerEmail"]').clear().type(speaker.email);

			cy.get('[data-testid="cfp-sign-in-to-submit"]').click();
			cy.url({ timeout: 20000 }).should('include', '/login');
			cy.url().should('include', `returnTo=/c/${slug}/cfp`);
			cy.waitForHydration();

			cy.get('input[name="email"]').clear().type(speaker.email);
			cy.get('input[name="password"]')
				.clear()
				.type(speaker.password || DEFAULT_TEST_PASSWORD, {
					log: false
				});
			cy.contains('button[type="submit"]', /^Login$/).click();

			cy.url({ timeout: 30000 }).should('include', '/portal');

			cy.visit('/portal');
			cy.waitForHydration();
			cy.contains('a', title).should('exist');
			cy.contains('You have not proposed anything yet.').should('not.exist');
		});
	});

	/**
	 * The JS path cancels the POST and parks the draft. Without JS the same
	 * click is a native submit, and a button without `formaction` posts to
	 * the default action — which this route does not have, so SvelteKit 404s.
	 * `formaction="?/submit"` sends it through `save()`, which already
	 * redirects an anonymous visitor to /login. Draft is still lost (no
	 * sessionStorage without JS); the path itself must not be an error page.
	 */
	it('sends a JS-less submit to /login, not a 404', () => {
		cy.clearCookies();
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/c/any-conference/cfp?/submit`,
			form: true,
			headers: { origin: Cypress.config('baseUrl') as string, accept: 'text/html' },
			body: { title: 'A talk that never lands' },
			followRedirect: false,
			failOnStatusCode: false
		}).then((res) => {
			expect(res.status, 'named submit action, not default').to.eq(303);
			const location = decodeURIComponent(String(res.headers.location));
			expect(location).to.include('/login?returnTo=');
			expect(location).to.include('/c/any-conference/cfp');
		});
	});
});
