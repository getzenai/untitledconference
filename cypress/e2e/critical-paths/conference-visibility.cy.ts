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

	/**
	 * Publishing and advertising used to be one switch, and the front page paid
	 * for it: a fixture called `grok-juror-1786581216747` sat one click from the
	 * hero, on the one surface whose job is "this product is real" (#402).
	 *
	 * The integration test proves the loaders answer differently. What it cannot
	 * prove is that an organizer can reach the second switch at all — the same
	 * gap that let `conference.status` ship with no writer but the seed script.
	 */
	// `?home=0`: the organizer is signed in, and `/` sends a signed-in user to
	// /home (#237). Without the bypass this spec would assert against the wrong
	// page and pass for the wrong reason — the link is missing from /home too.
	const visitFrontPage = () => cy.visit('/?home=0');
	const directoryEntry = () => cy.get('body').find(`a[href="/c/${slug}"]`);

	it('leaves a freshly published conference off the front page until someone says so', () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Publish')
			.click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		// Live, reachable, and deliberately not advertised.
		publicSiteStatus().should('eq', 200);
		visitFrontPage();
		directoryEntry().should('not.exist');

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="listing-submit"]')
			.should('contain.text', 'Show on the front page')
			.click();
		cy.get('[data-testid="listing-state"]', { timeout: 20000 }).should('contain.text', 'Listed');

		visitFrontPage();
		directoryEntry().should('exist');

		// And back off. Unlisting is not unpublishing: the link keeps working, which
		// is the whole reason the two switches are separate.
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="listing-submit"]')
			.should('contain.text', 'Remove from the front page')
			.click();
		cy.get('[data-testid="listing-state"]', { timeout: 20000 }).should(
			'contain.text',
			'Not in the'
		);

		visitFrontPage();
		directoryEntry().should('not.exist');
		publicSiteStatus().should('eq', 200);
	});
});
