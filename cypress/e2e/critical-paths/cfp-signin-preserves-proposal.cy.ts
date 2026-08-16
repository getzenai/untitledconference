/**
 * A signed-out visitor who fills the call and clicks "Sign in to submit"
 * must not come back to an empty form (#236).
 *
 * The button used to be a GET to /login. Every field lived only in the
 * component, so login dropped the draft with no message. The product promise
 * is the opposite: the click said submit, so after sign-in the proposal exists
 * on the Speaking tab.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

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

	it('creates the draft after the visitor registers from the sign-in page', () => {
		const slug = uniqueSlug();
		const title = `A draft worth keeping ${Date.now()}`;
		const speakerEmail = generateTestUserEmail('cfp-register-draft');

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
		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('input[name="title"]').clear().type(title);
		cy.get('[data-testid="cfp-sign-in-to-draft"]').click();

		cy.url({ timeout: 20000 }).should('include', `/login?returnTo=/c/${slug}/cfp`);
		cy.get('a')
			.contains('Register')
			.should('have.attr', 'href', `/register?returnTo=${encodeURIComponent(`/c/${slug}/cfp`)}`)
			.click();
		cy.url().should('include', `/register?returnTo=${encodeURIComponent(`/c/${slug}/cfp`)}`);
		cy.waitForHydration();
		cy.get('input[name="email"]').type(speakerEmail);
		cy.get('input[name="password"]').type(DEFAULT_TEST_PASSWORD, { log: false });
		cy.contains('button[type="submit"]', /^Register$/).click();

		cy.url({ timeout: 30000 }).should('match', /\/portal\/submissions\/\d+$/);
		cy.contains(title).should('be.visible');
		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', title).should('exist');
	});

	it('restores the form after a signed-out visitor uses the sign-in banner', () => {
		const slug = uniqueSlug();
		const title = `A banner must not eat this draft ${Date.now()}`;
		const speakerEmail = generateTestUserEmail('cfp-register-banner');

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
		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('input[name="title"]').clear().type(title);
		cy.get('textarea[name="abstract"]')
			.clear()
			.type('The visitor chose Sign in, not Save as draft.');
		cy.get('[data-testid="cfp-sign-in"]')
			.contains('a', /^Sign in$/)
			.click();

		cy.url({ timeout: 20000 }).should('include', `/login?returnTo=/c/${slug}/cfp`);
		cy.contains('a', 'Register').click();
		cy.waitForHydration();
		cy.get('input[name="email"]').type(speakerEmail);
		cy.get('input[name="password"]').type(DEFAULT_TEST_PASSWORD, { log: false });
		cy.contains('button[type="submit"]', /^Register$/).click();

		cy.url({ timeout: 30000 }).should('include', `/c/${slug}/cfp`);
		cy.get('input[name="title"]').should('have.value', title);
		cy.get('textarea[name="abstract"]').should(
			'have.value',
			'The visitor chose Sign in, not Save as draft.'
		);

		cy.contains('button', /^Save as draft$/).click();
		cy.location('pathname', { timeout: 30000 }).should('match', /\/portal\/submissions\/\d+$/);
		cy.contains(title).should('be.visible');
	});

	it('leads a returning speaker back to their draft before offering a second proposal', () => {
		const slug = uniqueSlug();
		const title = `Notes towards a talk ${Date.now()}`;

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
		cy.createAndLogin().then((speaker) => {
			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();
			cy.get('input[name="title"]').clear().type(title);
			cy.get('input[name="speakerName"]').clear().type('Priya Shah');
			cy.get('input[name="speakerEmail"]').clear().type(speaker.email);
			cy.contains('button', /^Save as draft$/).click();
			cy.location('pathname', { timeout: 30000 }).should('match', /\/portal\/submissions\/\d+$/);

			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();
			cy.get('[data-testid="cfp-existing-draft"]').should('contain.text', title);
			cy.get('[data-testid="cfp-continue-draft"]')
				.should('have.attr', 'href')
				.and('match', /\/portal\/submissions\/\d+\/edit$/);
			cy.get('input[name="title"]').should('not.exist');

			cy.get('[data-testid="cfp-start-another"]').click();
			cy.get('input[name="title"]').should('be.visible').and('have.value', '');
			cy.get('input[name="speakerName"]').should('have.value', 'Priya Shah');
			cy.get('input[name="speakerEmail"]').should('have.value', speaker.email);
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
