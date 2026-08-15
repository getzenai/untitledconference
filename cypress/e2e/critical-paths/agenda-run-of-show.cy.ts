/**
 * The run of show is reached from the agenda an organizer already uses (#449).
 *
 * A unit test pins the order and a talk with two speakers. This is the other
 * half of the done-when: the export is a control on the surface that holds the
 * programme, and it lists what that programme actually contains.
 */
const uniqueSlug = () => `run-of-show-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The run of show', () => {
	it('is opened from the agenda of an organizer with a filled programme', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					name: 'Stage Conf',
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

		cy.get('[data-testid="agenda-run-of-show"]')
			.should('be.visible')
			.and('have.attr', 'href', `/manage/${slug}/agenda/run-of-show`);
		cy.get('[data-testid="agenda-run-of-show"]').click();

		cy.location('pathname').should('eq', `/manage/${slug}/agenda/run-of-show`);
		cy.get('[data-testid="run-of-show"]').should('be.visible');
		cy.get('[data-testid="run-of-show-talk"]').should('have.length', 1);
		cy.get('[data-testid="run-of-show-title"]').should(
			'contain.text',
			'Build systems without the wait'
		);
		cy.get('[data-testid="run-of-show-room"]').should('contain.text', 'Main Hall');
		cy.get('[data-testid="run-of-show-time"]').should('contain.text', '09:00');
		cy.get('[data-testid="run-of-show-speakers"]').should('contain.text', 'Fixture Speaker 1');
	});
});
