/**
 * Registering without JavaScript — the register half of #221.
 *
 * `/login` already had a form action. `/register` posted the same way (real
 * POST, so the password never lands in the query string) and SvelteKit answered
 * that POST with `405 Method Not Allowed` because nothing handled it.
 *
 * Cypress cannot switch JavaScript off, so the spec posts the form the way an
 * unhydrated browser would: same URL, same encoding, same fields.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

describe('Registering before hydration', () => {
	const post = (body: Record<string, string>) =>
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/register`,
			form: true,
			headers: { origin: Cypress.config('baseUrl') as string, accept: 'text/html' },
			body,
			failOnStatusCode: false
		});

	it('creates the account and does not answer 405', () => {
		const email = generateTestUserEmail('nojs-register');

		post({ email, password: DEFAULT_TEST_PASSWORD }).then((res) => {
			expect(res.status, 'no 405, and no error page').to.be.oneOf([200, 303]);
			expect(res.body).to.not.contain('Method Not Allowed');
		});
	});

	it('says what is wrong on an empty submit instead of a status code', () => {
		post({ email: '', password: '' }).then((res) => {
			expect(res.status).to.eq(400);
			expect(res.body).to.not.contain('Method Not Allowed');
			expect(res.body).to.contain('Create your account');
		});
	});
});
