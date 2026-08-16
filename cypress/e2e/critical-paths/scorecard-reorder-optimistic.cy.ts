/**
 * #721: moving a scorecard criterion paints the swap before the action
 * replies, and a refused write puts the row back with a reason. The page
 * used to lock everything behind `busy` and leave the list sitting.
 */
const uniqueSlug = () => `sc721-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const addCriterion = (label: string, count: number) => {
	cy.chooseFromAppSelect('add-criterion-kind', 'Rating');
	cy.get('[data-testid="add-criterion-label"]').clear().type(label);
	cy.get('[data-testid="add-criterion-submit"]').click();
	cy.get('[data-testid="criterion-row"]').should('have.length', count);
	cy.get('[data-testid="add-criterion-label"]').should('have.value', '');
};

const openScorecard = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/rounds`);
	cy.waitForHydration();
	cy.get('form[action="?/add"] input[name="name"]').type('Screening');
	cy.get('form[action="?/add"] button[type="submit"]').click();
	cy.get('[data-testid="add-criterion"]').should('exist');
	addCriterion('Relevance', 1);
	addCriterion('Clarity', 2);
};

describe('Reordering scorecard criteria', () => {
	it('paints the swap before the action replies', () => {
		const slug = uniqueSlug();
		openScorecard(slug);

		cy.get('[data-testid="criterion-row"]')
			.eq(0)
			.find('input[name="label"]')
			.should('have.value', 'Relevance');

		cy.get('[data-testid="criterion-row"]')
			.eq(0)
			.invoke('attr', 'data-criterion-id')
			.then((firstId) => {
				cy.get('[data-testid="criterion-row"]')
					.eq(1)
					.invoke('attr', 'data-criterion-id')
					.then((secondId) => {
						cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/rounds`) }, (req) => {
							req.on('response', (res) => {
								res.setDelay(2500);
							});
						}).as('slowMove');

						cy.get('[data-testid="criterion-row"]')
							.eq(0)
							.find('[data-testid="criterion-move-down"]')
							.click();

						cy.get('[data-testid="criterion-row"]', { timeout: 800 })
							.eq(0)
							.should('have.attr', 'data-criterion-id', secondId);
						cy.get('[data-testid="criterion-row"]')
							.eq(0)
							.find('input[name="label"]')
							.should('have.value', 'Clarity');

						cy.wait('@slowMove');
						cy.get('[data-testid="criterion-row"]')
							.eq(0)
							.should('have.attr', 'data-criterion-id', secondId);
						cy.get('[data-testid="criterion-row"]')
							.eq(0)
							.find('input[name="label"]')
							.should('have.value', 'Clarity');
						cy.wrap(firstId).should('not.eq', secondId);
					});
			});
	});

	it('rolls the list back and shows the reason when the write is refused', () => {
		const slug = uniqueSlug();
		openScorecard(slug);

		cy.get('[data-testid="criterion-row"]')
			.eq(0)
			.invoke('attr', 'data-criterion-id')
			.then((firstId) => {
				cy.intercept(
					{ method: 'POST', url: new RegExp(`/manage/${slug}/rounds`) },
					{ statusCode: 500, body: 'nope' }
				).as('failedMove');

				cy.get('[data-testid="criterion-row"]')
					.eq(0)
					.find('[data-testid="criterion-move-down"]')
					.click();

				cy.wait('@failedMove');
				cy.get('[data-testid="criterion-row"]')
					.eq(0)
					.should('have.attr', 'data-criterion-id', firstId);
				cy.get('[data-testid="criterion-row"]')
					.eq(0)
					.find('input[name="label"]')
					.should('have.value', 'Relevance');
				cy.get('[data-testid="criterion-reorder-error"]').should('be.visible');
			});
	});
});
