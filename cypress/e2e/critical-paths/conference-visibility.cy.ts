/**
 * Publishing, driven through the product the way an organizer reaches it.
 *
 * The integration test beside the action proves the loaders change their answer.
 * What it cannot prove is that a real organizer can get there at all: before this
 * feature the only writer of `conference.status` was the seed script, so every
 * conference made in the app was permanently invisible — and nothing failed, no
 * test went red, the public site simply answered 404 forever.
 *
 * So this spec asserts the 404 *first*. A run that started at 200 would be
 * measuring the seeded demo conference, not the one it just created.
 */
const uniqueSlug = () => `visibility-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Publishing a conference', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Fixture Talk A']
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	const publicSiteStatus = () =>
		cy.request({ url: `/c/${slug}`, failOnStatusCode: false }).then((response) => response.status);

	it('turns the public site on and off from Settings', () => {
		// The precondition, stated as an assertion: a fresh conference is invisible.
		publicSiteStatus().should('eq', 404);

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="visibility-state"]').should('contain.text', 'Draft');

		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Publish')
			.click();

		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');
		publicSiteStatus().should('eq', 200);

		// Back down again. An organizer who published by accident has to be able to
		// undo it, and the 404 returning is what proves the switch is a switch.
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Return to draft')
			.click();

		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Draft');
		publicSiteStatus().should('eq', 404);
	});
});
