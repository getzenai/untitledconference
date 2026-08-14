/**
 * Taking a conference off the front page as a platform admin (#426).
 *
 * The action has its own integration tests. What only the running app can show
 * is the loop this page exists to close: the directory on `/` names a
 * conference, an admin who is *not* an organizer of it presses one button, and
 * the front page stops naming it — while `/c/<slug>` keeps answering.
 */
describe('Admin front-page listings', () => {
	it('unlists a conference the admin does not organize, without unpublishing it', () => {
		const stamp = Date.now();
		const slug = `frontpage-${stamp}`;

		// The conference belongs to somebody else. That is the whole case: nobody
		// with organizer access is around to flip the switch.
		cy.createAndLogin({ organizationName: `Owner Org ${stamp}` }).then((owner) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: owner.id, slug, name: `Front Page Conf ${stamp}`, days: ['2028-05-10'] }
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/settings`);
			cy.waitForHydration();
			cy.contains('button', 'Publish').click();
			cy.contains('button', 'Show on the front page', { timeout: 20000 }).click();
			cy.visit('/');
			cy.contains(`Front Page Conf ${stamp}`).should('be.visible');
		});

		cy.createTestUser({ organizationName: `Admin Org ${stamp}` }).then((admin) => {
			cy.task('setUserRole', { email: admin.email, role: 'admin' });
			cy.login(admin.email, admin.password);

			cy.visit('/admin/conferences');
			cy.waitForHydration();
			cy.get(`[data-testid="unlist-${slug}"]`).click();

			cy.get(`[data-testid="admin-conference-row-${slug}"]`).should('not.exist');

			cy.visit('/');
			cy.contains(`Front Page Conf ${stamp}`).should('not.exist');
			// Unlisted is not unpublished: the conference site still answers.
			cy.request(`/c/${slug}`).its('status').should('eq', 200);
		});
	});
});
