/**
 * #721: advancing a stand on Speaker materials paints the next name before
 * the action replies, and a refused write puts the row back with a reason.
 * That page used to reload.
 */
const uniqueSlug = () => `ed721-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk in the editorial loop';

const openMaterials = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: [TALK],
				sessionStatus: 'accepted'
			}
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();

		cy.get('[data-testid="editorial-stand"]').should('exist');
		cy.chooseFromAppSelect('editorial-stand-select', 'Materials requested');
		cy.get('[data-testid="set-editorial-stand"]').click();
		cy.get('[data-testid="submission-editorial-stand"]').should('contain', 'Materials requested');

		cy.visit(`/manage/${slug}/content`);
		cy.waitForHydration();
		cy.get('[data-testid="hanging-stand"]')
			.should('contain', TALK)
			.and('have.attr', 'data-stand', 'materials_requested');
	});
};

describe('Advancing a stand on Speaker materials', () => {
	it('paints the next stand before the action replies', () => {
		const slug = uniqueSlug();
		openMaterials(slug);

		cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/content`) }, (req) => {
			req.on('response', (res) => {
				res.setDelay(2500);
			});
		}).as('slowAdvance');

		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.get('[data-testid="hanging-stand"]', { timeout: 800 }).should(
			'have.attr',
			'data-stand',
			'received'
		);

		cy.wait('@slowAdvance');
		cy.get('[data-testid="hanging-stand"]').should('have.attr', 'data-stand', 'received');
		cy.get('[data-testid="advance-editorial-stand"]').should('contain', 'reviewed');
	});

	it('rolls the row back and shows the reason when the write is refused', () => {
		const slug = uniqueSlug();
		openMaterials(slug);

		cy.intercept(
			{ method: 'POST', url: new RegExp(`/manage/${slug}/content`) },
			{ statusCode: 500, body: 'nope' }
		).as('failedAdvance');

		cy.get('[data-testid="advance-editorial-stand"]').click();

		cy.wait('@failedAdvance');
		cy.get('[data-testid="hanging-stand"]').should(
			'have.attr',
			'data-stand',
			'materials_requested'
		);
		cy.get('[data-testid="stand-write-error"]').should('be.visible');
	});
});
