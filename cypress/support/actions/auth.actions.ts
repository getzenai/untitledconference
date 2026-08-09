/// <reference types="cypress" />
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { RegisterPage } from '../pages/register.page';

const loginPage = new LoginPage();
const registerPage = new RegisterPage();
const homePage = new HomePage();

/** Ported from e2e/actions/auth.actions.ts. */
export const AuthActions = {
	loginViaUi(email: string, password: string): void {
		loginPage.visit();
		loginPage.loginAndWaitForRedirect(email, password);
		homePage.shouldBeLoggedIn();
	},

	loginWithoutRedirect(email: string, password: string): void {
		loginPage.visit();
		loginPage.login(email, password);
	},

	registerViaUi(email: string, password: string): void {
		registerPage.visit();
		registerPage.registerAndWaitForRedirect(email, password);
		homePage.shouldBeLoggedIn();
	},

	logout(): void {
		homePage.visit();
		homePage.logout();
	},

	shouldHaveSession(): void {
		cy.getCookie('better-auth.session_token').should('exist');
	},

	shouldNotHaveSession(): void {
		cy.getCookie('better-auth.session_token').should('not.exist');
	}
};
