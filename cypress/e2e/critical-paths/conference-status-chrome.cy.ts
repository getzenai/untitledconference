/**
 * Draft, live, archived — three states the chrome has to tell apart (#474).
 *
 * Before this the rail showed "DRAFT — NOT PUBLIC YET" for everything that was
 * not published, so an archived conference claimed it had never been out; and
 * "View the public site" pointed at `/c/<slug>` in every state, so following the
 * app's own link from a draft landed on the app-wide 404 — which told the
 * organizer there was no conference at that address.
 *
 * A browser is the only place this is real: the badge, the link and the error
 * page are three different renders of the same fact, and the bug was that they
 * disagreed.
 */
describe('conference status in the manage chrome', () => {
	it('says draft, then live, then archived — and never links into a 404', () => {
		const stamp = Date.now();
		const slug = `status-${stamp}`;
		const name = `Status Conf ${stamp}`;

		cy.viewport(1440, 900);
		cy.createAndLogin({ organizationName: `Status Org ${stamp}` });

		cy.visit('/manage/new');
		cy.waitForHydration();
		cy.get('input[name="name"]').clear().type(name);
		cy.get('input[name="slug"]').clear().type(slug);
		cy.contains('button[type="submit"]', 'Create conference').click();
		cy.location('pathname', { timeout: 20000 }).should('include', `/manage/${slug}/`);

		// Draft: the badge names the state, and there is no link to a site that
		// does not exist yet — the way out points at the control that publishes it.
		cy.get('[data-testid="draft-badge"]').should('contain.text', 'Draft');
		cy.get('[data-testid="view-public-site"]').should('not.exist');
		cy.get('[data-testid="public-site-unavailable"]').should(
			'have.attr',
			'href',
			`/manage/${slug}/settings`
		);

		// The sentence a visitor gets on the address that is real but not out yet.
		cy.visit(`/c/${slug}`, { failOnStatusCode: false });
		cy.waitForHydration();
		cy.get('[data-testid="error-status"]').should('have.text', '404');
		cy.get('[data-testid="error-message"]').should('contain', 'has not been published yet');
		cy.get('[data-testid="error-message"]').should(
			'not.contain',
			'No conference with that address'
		);

		// Live: no badge at all, and the real link.
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="visibility-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('have.text', 'Live');
		cy.get('[data-testid="draft-badge"]').should('not.exist');
		cy.get('[data-testid="view-public-site"]').should('have.attr', 'href', `/c/${slug}`);

		// Archived: its own badge, not the draft one, and the public site is named
		// as offline rather than as never having existed.
		cy.get('[data-testid="archive-disclosure"]').click();
		cy.get('[data-testid="archive-confirm-slug"]').type(slug);
		cy.get('[data-testid="archive-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('have.text', 'Archived');
		cy.get('[data-testid="draft-badge"]').should('contain.text', 'Archived');
		cy.get('[data-testid="draft-badge"]').should('not.contain.text', 'Draft');
		cy.get('[data-testid="view-public-site"]').should('not.exist');

		cy.visit(`/c/${slug}`, { failOnStatusCode: false });
		cy.waitForHydration();
		cy.get('[data-testid="error-message"]').should('contain', 'archived');
	});
});
