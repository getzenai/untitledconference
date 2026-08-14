/**
 * Signing in without JavaScript — the other half of #221.
 *
 * The login form is a real POST form on purpose (see `credential-form-method`):
 * before Svelte hydrates, superForm's `SPA: true` cancels nothing, so a submit
 * navigates natively to `/login`. What used to happen next is the whole bug —
 * `/login` had no form action, and SvelteKit answers a POST to a page without one
 * with `405 Method Not Allowed`. The person sees the status code as a page.
 *
 * Cypress cannot switch JavaScript off, so the spec posts the form the way an
 * unhydrated browser would: same URL, same encoding, same fields.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

describe('Signing in before hydration', () => {
	const post = (body: Record<string, string>) =>
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/login`,
			form: true,
			// A form POST has to look like it came from the app, and `text/html` asks
			// for the no-JS path rather than an ActionResult body.
			headers: { origin: Cypress.config('baseUrl') as string, accept: 'text/html' },
			body,
			failOnStatusCode: false
		});

	it('signs the person in and lands them on /home', () => {
		const email = generateTestUserEmail('nojs-login');

		cy.createTestUser({ email, password: DEFAULT_TEST_PASSWORD }).then(() => {
			cy.clearCookies();
			post({ email, password: DEFAULT_TEST_PASSWORD, rememberMe: 'on' }).then((res) => {
				expect(res.status, 'no 405, and no error page').to.eq(200);
				// cy.request follows the redirect, so the proof is where it ended up.
				expect(res.body).to.not.contain('Method Not Allowed');
				cy.getCookie('better-auth.session_token').should('exist');
			});

			// The session the POST established is a real one: a protected page opens.
			// Pathname, not a substring — `/login?returnTo=/home` includes `/home`
			// and used to make this pass on the bounce it was meant to catch.
			// cy.request cookies do reach cy.visit (`cy.login` proves that); a
			// bounce here is the product, not the jar.
			cy.visit('/home');
			cy.location('pathname').should('eq', '/home');
		});
	});

	it('says what is wrong on bad credentials instead of a status code', () => {
		const email = generateTestUserEmail('nojs-login-bad');

		cy.createTestUser({ email, password: DEFAULT_TEST_PASSWORD }).then(() => {
			cy.clearCookies();
			post({ email, password: 'not-the-password-123', rememberMe: 'on' }).then((res) => {
				expect(res.status).to.eq(401);
				expect(res.body).to.contain('Sign in');
				expect(res.body).to.not.contain('Method Not Allowed');
				cy.getCookie('better-auth.session_token').should('not.exist');
			});
		});
	});

	/**
	 * The reason this action posts to `auth.handler` instead of calling
	 * `auth.api.signInEmail`: the rate limiter sits in the handler. Called directly
	 * it would be skipped, and a fix for a status code would have opened an
	 * unthrottled password-guessing path beside a throttled one.
	 *
	 * The assertion is equality with the endpoint the browser posts to, not a 429:
	 * whether Better Auth throttles at all depends on `NODE_ENV` and on whether it
	 * can resolve a client address, and neither holds behind this test server — five
	 * attempts come back 401 on *both* paths here. Equality is the part that stays
	 * true wherever the app runs, and it is what the claim actually is.
	 */
	it('answers a run of bad attempts exactly like the browser’s own sign-in', () => {
		const email = generateTestUserEmail('nojs-login-throttle');

		cy.createTestUser({ email, password: DEFAULT_TEST_PASSWORD }).then(() => {
			cy.clearCookies();
			// Better Auth allows 3 sign-in attempts per 10s per client by default; the
			// fourth is the one that has to bounce.
			const viaForm: number[] = [];
			const viaApi: number[] = [];
			for (let attempt = 0; attempt < 5; attempt++) {
				post({ email, password: 'wrong-password-123' }).then((res) => viaForm.push(res.status));
			}
			for (let attempt = 0; attempt < 5; attempt++) {
				cy.request({
					method: 'POST',
					url: `${Cypress.config('baseUrl')}/api/auth/sign-in/email`,
					body: { email, password: 'wrong-password-123' },
					failOnStatusCode: false
				}).then((res) => viaApi.push(res.status));
			}
			cy.then(() => {
				expect(viaForm.join(','), 'form path vs /api/auth/sign-in/email').to.eq(viaApi.join(','));
			});
		});
	});

	it('refuses an empty submit without a stack trace', () => {
		cy.clearCookies();
		post({ email: '', password: '' }).then((res) => {
			expect(res.status).to.eq(400);
			expect(res.body).to.not.contain('Method Not Allowed');
		});
	});
});
