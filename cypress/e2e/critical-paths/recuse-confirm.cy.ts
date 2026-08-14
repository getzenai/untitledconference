/**
 * #463: recusing must ask first, and say so afterwards.
 *
 * Like #409 this is invisible to the unit suite, and for the same reason: a
 * closed `AlertDialog` renders nothing on the server, so the markup assertion
 * a unit test could make is exactly the assertion that proves nothing. What
 * matters here happens in the browser, in the order two things run — the
 * dialog has to win the race against `use:enhance`, which registers its own
 * submit listener on the same form and never asks whether anybody cancelled.
 *
 * The load-bearing assertion is the one after "Keep the assignment": the
 * review is still assigned after a reload. A test that only checked the dialog
 * appears would pass against a build that recuses while it is still asking.
 */
const uniqueSlug = () => `recuse463-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'The talk I should not judge';

describe('Recusing asks before it hands the talk back', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK]
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/rounds`);
			cy.waitForHydration();
			cy.get('form[action="?/add"] input[name="name"]').type('Screening');
			cy.contains('button[type="submit"]', 'Add round').click();
			cy.get('[data-testid="round-summary"]').should('contain.text', 'Open');

			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

			cy.visit(`/manage/${slug}/submissions`);
			cy.contains('a', TALK).click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email)
				.contains('button', 'Assign')
				.click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email).should(
				'contain.text',
				'Unassign'
			);

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();
			cy.contains('a', TALK).click();
			cy.waitForHydration();
		});
	});

	it('keeps the assignment when the reviewer backs out of the dialog', () => {
		cy.contains('button', 'Recuse myself').click();

		cy.get('[data-testid="recuse-dialog"]').should('be.visible');
		cy.get('[data-testid="recuse-cancel"]').click();
		cy.get('[data-testid="recuse-dialog"]').should('not.exist');

		// Still on the scorecard, not bounced to the queue.
		cy.contains('button', 'Recuse myself').should('exist');

		// The reload is the honest check: a recusal that reached the server would
		// come back with the page even if this screen still looked untouched.
		cy.reload();
		cy.contains('button', 'Recuse myself').should('exist');
		cy.get('textarea[name="comment"]').should('exist');
	});

	it('hands the talk back once the reviewer confirms, and says so on the queue', () => {
		cy.contains('button', 'Recuse myself').click();
		cy.get('[data-testid="recuse-confirm"]').click();

		cy.location('pathname').should('eq', `/review/${slug}`);
		cy.get('[data-testid="recused-notice"]')
			.should('be.visible')
			.and('contain.text', TALK)
			.and('contain.text', 'The organizers have it back');

		// And it really happened: the talk is out of this reviewer's queue.
		cy.visit(`/review/${slug}`);
		cy.contains('a', TALK).should('not.exist');
	});
});
