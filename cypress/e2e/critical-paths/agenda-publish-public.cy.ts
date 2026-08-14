/**
 * Publishing the agenda is what makes the public page tell the truth (#497).
 *
 * A slot on the organizer grid is a draft until they publish. The public
 * loader only serves confirmed talks, so "Publish the agenda" is the moment
 * those sessions appear at `/c/<slug>/agenda`. The organizer screen used to
 * stay silent about that, and once it *was* live the filled button said
 * Unpublish.
 *
 * A unit test can see the status line and the button variant. It cannot see
 * that the other side of the site actually gained or lost the session.
 */
const uniqueSlug = () => `agenda-pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Publishing the agenda', () => {
	const slug = uniqueSlug();

	before(() => {
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					name: 'DevFlow Conf 2028',
					days: ['2028-05-10'],
					sessions: ['Build systems without the wait']
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-rooms"] textarea[name="names"]')
			.clear()
			.type('Main Hall{enter}');
		cy.get('[data-testid="settings-room-row"][data-name="Main Hall"]').should('exist');
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('[data-testid="agenda-room-card"]', 'Main Hall')
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		cy.chooseFromAppSelect('agenda-slot-session', 'Build systems without the wait');
		cy.chooseFromAppSelect('agenda-slot-room', 'Main Hall');
		cy.chooseFromAppSelect('agenda-slot-start', '09:00');
		cy.get('[data-testid="agenda-slot-place"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	});

	it('puts the session on the public agenda, then takes it off again', () => {
		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();

		cy.get('[data-testid="agenda-public-state"]').should(
			'contain.text',
			'The public cannot see these slots yet.'
		);
		cy.get('[data-testid="agenda-publish"]').should('contain.text', 'Publish the agenda');

		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('Build systems without the wait').should('not.exist');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.get('[data-testid="agenda-publish"]').click();

		cy.get('[data-testid="agenda-publish-result"]', { timeout: 20000 }).should(
			'contain.text',
			'The public agenda now shows 1 session.'
		);
		cy.get('[data-testid="agenda-public-state"]').should(
			'contain.text',
			'The public agenda shows 1 session.'
		);
		cy.get('[data-testid="agenda-publish"]').should('contain.text', 'Unpublish the agenda');

		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('Build systems without the wait').should('be.visible');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.get('[data-testid="agenda-publish"]').click();
		cy.get('[data-testid="agenda-publish-result"]', { timeout: 20000 }).should(
			'contain.text',
			'Taken off the public agenda.'
		);

		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('Build systems without the wait').should('not.exist');
	});
});
