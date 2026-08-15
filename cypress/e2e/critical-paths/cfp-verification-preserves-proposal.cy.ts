/**
 * The verification-only fork of anonymous CFP registration (#643).
 *
 * The ordinary suite runs with verification disabled, like production today.
 * CI runs this spec a second time with REQUIRE_EMAIL_VERIFICATION=true so the
 * email link, its new-tab storage boundary and the verified session are real.
 */
import {
	autosavedProposalKey,
	pendingProposalKey
} from '../../../src/lib/conference/pending-proposal';
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

const verificationDescribe =
	Cypress.env('REQUIRE_EMAIL_VERIFICATION') === 'true' ? describe : describe.skip;

verificationDescribe('Registering from the CFP with email verification', () => {
	it('restores the anonymous draft after the verification link opens without sessionStorage', () => {
		const slug = `cfp-verification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const title = `The draft crossed tabs ${Date.now()}`;
		const speakerEmail = generateTestUserEmail('cfp-verification');

		cy.createAndLogin().then((organizer) => {
			cy.request('POST', '/api/v1/test/agenda-fixture', {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: []
			});
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
		cy.get('textarea[name="abstract"]').clear().type('No tab should own the only copy.');
		cy.get('[data-testid="cfp-sign-in-to-draft"]').click();
		cy.contains('a', 'Register').click();
		cy.waitForHydration();
		cy.get('input[name="email"]').type(speakerEmail);
		cy.get('input[name="password"]').type(DEFAULT_TEST_PASSWORD, { log: false });
		cy.contains('button[type="submit"]', /^Register$/).click();

		cy.url({ timeout: 30000 }).should('include', '/verify-email');
		cy.window().then((win) => {
			expect(win.sessionStorage.getItem(pendingProposalKey(slug))).not.to.equal(null);
			// The mail link opens in a new tab in the real journey. Clearing only
			// sessionStorage gives this tab the same storage shape while retaining
			// the shared-browser localStorage copy whose privacy rule #505 protects.
			win.sessionStorage.clear();
		});

		cy.request(`/api/v1/test/verification-link?email=${encodeURIComponent(speakerEmail)}`)
			.its('body.url')
			.then((verificationUrl: string) => cy.visit(verificationUrl));
		cy.url({ timeout: 30000 }).should('include', '/email-verified');
		cy.contains('button', 'Continue to your proposal').click();

		cy.url({ timeout: 30000 }).should('match', /\/portal\/submissions\/\d+$/);
		cy.contains(title).should('be.visible');
		cy.window().then((win) => {
			expect(win.localStorage.getItem(autosavedProposalKey(slug, null))).to.equal(null);
		});
	});
});
