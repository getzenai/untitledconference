/**
 * The human organizer path for #120: invite a new reviewer, let them accept,
 * assign real work, and see the outstanding count back on the committee page.
 *
 * Service tests pin conference scoping and track allow-lists. This spec owns the
 * part only a browser can prove: the shareable link survives registration and
 * creates a reviewer who actually appears in the assignment UI.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';

const uniqueSlug = () => `review-team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Reviewer management', () => {
	it('invites, accepts, assigns, and reports the reviewer work', () => {
		const slug = uniqueSlug();
		const reviewerEmail = generateTestUserEmail('reviewer-invite');

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Review me']
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(reviewerEmail);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.get('input[aria-label="Reviewer invitation link"]')
				.invoke('val')
				.should('match', /\/invite\//);
			cy.get('[data-testid="pending-reviewer-invitations"]')
				.should('contain.text', reviewerEmail)
				.find('a')
				.invoke('attr', 'href')
				.then((invitePath) => {
					expect(invitePath).to.match(/^\/invite\//);
					cy.clearCookies();
					cy.visit(invitePath!);
					cy.contains('button', 'Continue to Sign Up').click();
					cy.url().should('include', '/register?invitation=');
					cy.get('input[name="email"]').type(reviewerEmail);
					cy.get('input[name="password"]').type(DEFAULT_TEST_PASSWORD, { log: false });
					cy.contains('button[type="submit"]', 'Register').click();
					cy.url({ timeout: 20000 }).should('include', '/home');

					cy.clearCookies();
					cy.login(organizer.email, organizer.password);
					cy.visit(`/manage/${slug}/people`);
					cy.contains('[data-testid="people-committee"] li', reviewerEmail).should(
						'contain.text',
						'0/0 submitted'
					);
					cy.get('[data-testid="pending-reviewer-invitations"]').should('not.exist');

					cy.visit(`/manage/${slug}/rounds`);
					cy.waitForHydration();
					// Scoped to the add form: every existing round now carries its own
					// `name` field, because a round's name is editable in place.
					cy.get('form[action="?/add"] input[name="name"]').type('Screening');
					cy.contains('button[type="submit"]', 'Add round').click();
					// The name lives in an input now, so it is a value rather than text.
					cy.get('form[action="?/rename"] input[name="name"]').should('have.value', 'Screening');

					cy.visit(`/manage/${slug}/submissions`);
					cy.contains('a', 'Review me').click();
					cy.contains('[data-testid="review-assignments"] li', reviewerEmail)
						.contains('button', 'Assign')
						.click();
					cy.contains('[data-testid="review-assignments"] li', reviewerEmail).should(
						'contain.text',
						'Unassign'
					);

					cy.visit(`/manage/${slug}/people`);
					cy.contains('[data-testid="people-committee"] li', reviewerEmail)
						.should('contain.text', '0/1 submitted')
						.and('contain.text', '1 outstanding');
				});
		});
	});
});
