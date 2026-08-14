/// <reference types="cypress" />

/**
 * Custom Cypress commands.
 *
 * These replace the Playwright `TestUserManager` (e2e/test-user-manager.ts):
 * user creation goes through the same `/api/v1/test/register` endpoint, and
 * cleanup happens through the `cleanupTestUsers` Node task in cypress.config.ts.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail, type TestUser } from './globals';

export interface CreateUserOptions {
	email?: string;
	password?: string;
	organizationName?: string;
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Cypress {
		interface Chainable {
			/** Register a user through `/api/v1/test/register` (email pre-verified, org created). */
			createTestUser(options?: CreateUserOptions): Chainable<TestUser>;
			/** Establish a session through Better Auth's sign-in endpoint, cached with `cy.session()`. */
			login(email: string, password: string): Chainable<void>;
			/** Establish a session by filling in the real login form. Not cached. */
			loginViaUi(email: string, password: string): Chainable<void>;
			/** Create a user and log them in (API) in one call. */
			createAndLogin(options?: CreateUserOptions): Chainable<TestUser>;
			/** Register through the real registration form. */
			registerViaUi(email: string, password: string): Chainable<void>;
			/** Log out through the dashboard button and land back on /login. */
			logout(): Chainable<void>;
			/** Point the current session at an organization (by name, default: the first). */
			setActiveOrganization(name?: string): Chainable<string>;
			/** Wait until Svelte has hydrated the page before interacting with it. */
			waitForHydration(): Chainable<void>;
			/** Pick an option from an app select (the shadcn dropdown), by its testid. */
			chooseFromAppSelect(testId: string, option: string | RegExp): Chainable<void>;
		}
	}
}

const baseUrl = (): string => Cypress.config('baseUrl') || 'http://localhost:5174';

Cypress.Commands.add('waitForHydration', () => {
	cy.get('body[data-hydrated="true"]', { timeout: 30000 }).should('exist');
});

Cypress.Commands.add('createTestUser', (options: CreateUserOptions = {}) => {
	const email = options.email || generateTestUserEmail();
	const password = options.password || DEFAULT_TEST_PASSWORD;
	const organizationName = options.organizationName;

	return cy
		.request({
			method: 'POST',
			url: `${baseUrl()}/api/v1/test/register`,
			body: { email, password, organizationName },
			failOnStatusCode: false
		})
		.then((response) => {
			if (response.status !== 200) {
				throw new Error(
					`createTestUser failed (${response.status}): ${JSON.stringify(response.body)}`
				);
			}
			const user: TestUser = {
				id: response.body.user.id,
				email: response.body.user.email,
				password
			};
			return cy.wrap(user, { log: false });
		});
});

Cypress.Commands.add('login', (email: string, password: string) => {
	cy.session(
		['api-login', email, password],
		() => {
			// Better Auth's own sign-in endpoint - the one the browser client calls.
			// `/api/v1/public/login` cannot be used here: `auth.api.signInEmail()`
			// returns no headers for server-side calls, so that route never emits a
			// Set-Cookie and the browser would end up without a session.
			cy.request({
				method: 'POST',
				url: `${baseUrl()}/api/auth/sign-in/email`,
				body: { email, password, rememberMe: true }
			})
				.its('status')
				.should('eq', 200);
		},
		{
			cacheAcrossSpecs: false,
			validate: () => {
				cy.getCookie('better-auth.session_token').should('exist');
			}
		}
	);
});

Cypress.Commands.add('loginViaUi', (email: string, password: string) => {
	cy.visit('/login');
	cy.waitForHydration();
	cy.get('input[name="email"]').clear().type(email);
	cy.get('input[name="password"]').clear().type(password, { log: false });
	cy.contains('button[type="submit"]', /^Login$/).click();
	cy.url({ timeout: 20000 }).should('include', '/home');
});

Cypress.Commands.add('createAndLogin', (options: CreateUserOptions = {}) => {
	return cy.createTestUser(options).then((user) => {
		cy.login(user.email, user.password);
		return cy.wrap(user, { log: false });
	});
});

Cypress.Commands.add('registerViaUi', (email: string, password: string) => {
	cy.visit('/register');
	cy.waitForHydration();
	cy.get('input[name="email"]').clear().type(email);
	cy.get('input[name="password"]').clear().type(password, { log: false });
	cy.contains('button[type="submit"]', /^Register$/).click();
});

/**
 * Nothing in the app sets `session.activeOrganizationId` (no
 * `databaseHooks.session.create` hook, no `setActiveOrganization()` call), so a
 * freshly logged-in user has no active organization and the organization
 * settings pages cannot resolve one. This calls Better Auth's own
 * `organization/set-active` endpoint - the call the app is missing - so
 * organization specs can exercise the actual lifecycle.
 */
Cypress.Commands.add('setActiveOrganization', (name?: string) => {
	return cy
		.request({ method: 'GET', url: `${baseUrl()}/api/auth/organization/list` })
		.then((listResponse) => {
			const organizations = listResponse.body as Array<{ id: string; name: string }>;
			const match = name ? organizations?.find((org) => org.name === name) : organizations?.[0];
			if (!match) {
				throw new Error(
					`setActiveOrganization: no organization${name ? ` named "${name}"` : ''} for this user`
				);
			}
			const organizationId = match.id;
			return cy
				.request({
					method: 'POST',
					url: `${baseUrl()}/api/auth/organization/set-active`,
					body: { organizationId }
				})
				.then(() => cy.wrap(organizationId, { log: false }));
		});
});

Cypress.Commands.add('logout', () => {
	// Logout lives in the sidebar account menu, not on the home card (that
	// second button was starter leftover removed with #62). Item is a menuitem
	// with data-testid — not a bare <button> matching /^Log out$/.
	cy.visit('/home');
	cy.waitForHydration();
	cy.get('[data-testid="app-sidebar"] [data-sidebar="footer"] button').first().click();
	cy.get('[data-testid="nav-user-logout"]').should('be.visible').click();
	cy.url({ timeout: 20000 }).should('include', '/login');
});

/**
 * The replacement for `.select()` (#167).
 *
 * `.select()` needs a native `<select>`; an app select is a button plus a
 * listbox portalled to the end of `<body>`, so the option is not inside the
 * control's own subtree and no scoped `cy.get` will find it. Three specs grew
 * their own copy of this two-liner, which is why it lives here now.
 *
 * The trigger is scrolled to before it is clicked, and clicked without `force`.
 * That is not politeness — `force` skips the scroll, and bits-ui anchors the
 * listbox to the trigger's box, so a control below the fold gets a listbox
 * positioned off-screen: open in the DOM, never `:visible`, and the failure
 * reads as "the dropdown does not work" when the page had simply not moved.
 * Waiting for the previous listbox to leave (last line) is what makes the
 * unforced click safe when several picks follow each other in one form.
 */
Cypress.Commands.add('chooseFromAppSelect', (testId: string, option: string | RegExp) => {
	cy.get(`[data-testid="${testId}"]`).first().scrollIntoView().click();
	// Scoped to the open listbox: two selects on one screen can offer the same
	// label ("Hall 1" as a filter and as the editor's room), and an unscoped
	// `[role="option"]` would take whichever rendered first.
	cy.get('[role="listbox"]:visible').within(() => {
		cy.contains('[role="option"]', option).click();
	});
	cy.get('[role="listbox"]').should('not.exist');
});

export {};
