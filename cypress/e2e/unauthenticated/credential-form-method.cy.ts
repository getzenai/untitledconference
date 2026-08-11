/**
 * Credential forms must be POST forms
 *
 * The auth pages submit through superForm with `SPA: true`, which cancels the
 * native submit — but only once Svelte has hydrated. Before that (and with JS
 * off entirely) the browser applies its own default, and a `<form>` without
 * `method` defaults to GET: password, email and remember-me end up in the query
 * string, and from there in the browser history, in the `Referer` of every
 * following request and in each proxy log on the way. cypress/CLAUDE.md already
 * warns that a pre-hydration submit "hits the raw <form> and triggers a native
 * navigation" — this is what that navigation used to carry.
 *
 * Cypress cannot switch JavaScript off, so this spec asserts the thing the
 * browser actually decides on: the markup the server sends. `method` and
 * `action` fully determine where an unhydrated submit goes; nothing else can
 * change it. Every one of these routes serves the form in its SSR HTML, so
 * cy.request sees exactly what a JS-less browser would.
 */

const CREDENTIAL_PAGES = [
	{ name: 'login', url: '/login' },
	{ name: 'register', url: '/register' },
	{ name: 'forgot password', url: '/forgot-password' },
	{ name: 'reset password', url: '/reset-password?token=e2e-not-a-real-token' },
	{ name: 'complete registration', url: '/complete-registration?token=e2e-not-a-real-token' }
];

function formsIn(html: string): HTMLFormElement[] {
	const document = new DOMParser().parseFromString(html, 'text/html');
	return Array.from(document.querySelectorAll('form'));
}

describe('Credential forms are POST forms before hydration', () => {
	CREDENTIAL_PAGES.forEach(({ name, url }) => {
		it(`${name} submits with POST, not GET`, () => {
			cy.request(url).then((response) => {
				const forms = formsIn(response.body);
				const credentialForms = forms.filter((form) =>
					form.querySelector('input[type="password"], input[name="email"]')
				);

				// A page that stopped serving its form would make every assertion
				// below vacuously true.
				expect(credentialForms, 'credential form is server-rendered').to.have.length(1);

				const form = credentialForms[0];
				expect(form.getAttribute('method')?.toLowerCase(), 'method').to.equal('post');

				// An `action` pointing elsewhere would move the problem rather than
				// fix it; empty or absent means "this URL", which is what we want.
				const action = form.getAttribute('action');
				expect(action === null || action === '', `action (${action})`).to.equal(true);
			});
		});
	});
});
