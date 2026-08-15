/**
 * #444: the acceptance call, in a browser.
 *
 * The unit suite can prove the arithmetic and the integration suite can prove the
 * queries. Neither can prove the thing the screen is for: that the number the room
 * is arguing over moves when somebody accepts a talk. That number is produced by
 * a server load, re-read after an enhanced form post, and rendered by hydrated
 * Svelte — three places it can silently stop updating while every test but this
 * one stays green.
 *
 * The load-bearing assertion is the one after the reload. A count that only
 * changes on screen is the exact failure this screen must not have: a committee
 * would keep accepting against a number that was never written.
 */
const uniqueSlug = () => `dec444-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALKS = ['Alpha talk', 'Beta talk'];

describe('The decision meeting counts slots down as talks are accepted', () => {
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
					sessions: TALKS,
					sessionStatus: 'submitted',
					// A seat in the room is somebody who handed in a review. Without
					// this the screen correctly shows nobody to lobby for anything.
					reviewed: TALKS
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();
	});

	it('takes the slot count, then counts it down and keeps it', () => {
		// Nothing said yet: a count of what is accepted, and no invented remainder.
		cy.get('[data-testid="slot-total-sentence"]').should('have.text', '0 accepted');

		cy.get('[data-testid="slot-edit-toggle"]').click();
		cy.get('[data-testid="slot-form"] input[name="total"]').clear().type('3');
		cy.contains('[data-testid="slot-form"] button', 'Save slots').click();

		cy.get('[data-testid="slot-total-sentence"]').should('have.text', '0 accepted, 3 left of 3');
		cy.get('[data-testid="slot-total"]').should('contain', '3 left');

		cy.get('[data-testid="lobbying-queue"] tbody tr')
			.first()
			.find('[data-testid="decide-accept"]')
			.click();

		cy.get('[data-testid="slot-total"]').should('contain', '2 left');
		cy.get('[data-slot="status-badge"][data-status="accepted"]').should('have.length', 1);

		// The honest check: the decision and the capacity both reached the database.
		cy.reload();
		cy.get('[data-testid="slot-total-sentence"]').should('have.text', '1 accepted, 2 left of 3');
		// And the accepted talk is still in the member's list — a queue that empties
		// as the call runs hides that somebody's number two already got in.
		cy.get('[data-testid="lobbying-queue"] tbody tr').should('have.length', TALKS.length);
	});

	it('seats the member who reviewed, with the size of their queue', () => {
		cy.get('[data-testid="committee-tabs"] [data-testid="committee-tab"]')
			.should('have.length', 1)
			.and('contain', TALKS.length);
	});
});
