/**
 * #721: moving a CFP field paints the swap before the action replies, and a
 * refused write puts the row back with a reason. The page used to lock
 * everything behind `busy` and leave the list sitting.
 */
const uniqueSlug = () => `cf721-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const addField = (label: string) => {
	cy.get('form[action="?/addField"] input[name="label"]').clear().type(label);
	cy.contains('form[action="?/addField"] button', 'Add field').click();
	cy.contains('summary', label).should('exist');
	cy.get('form[action="?/addField"] input[name="label"]').should('have.value', '');
};

const openCfp = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: { userId: organizer.id, slug, days: ['2028-05-10'] }
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.contains('h2', 'Settings').should('exist');
		addField('First question');
		addField('Second question');
	});
};

describe('Reordering CFP fields', () => {
	it('paints the swap before the action replies', () => {
		const slug = uniqueSlug();
		openCfp(slug);

		cy.get('[data-testid="cfp-field"]').eq(0).should('contain', 'First question');
		cy.get('[data-testid="cfp-field"]')
			.eq(0)
			.invoke('attr', 'data-field-id')
			.then((firstId) => {
				cy.get('[data-testid="cfp-field"]')
					.eq(1)
					.invoke('attr', 'data-field-id')
					.then((secondId) => {
						cy.get('[data-testid="cfp-field"]').eq(0).find('summary').click();

						cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/cfp`) }, (req) => {
							req.on('response', (res) => {
								res.setDelay(2500);
							});
						}).as('slowMove');

						cy.get('[data-testid="cfp-field"]')
							.eq(0)
							.find('[data-testid="cfp-field-move-down"]')
							.click();

						cy.get('[data-testid="cfp-field"]', { timeout: 800 })
							.eq(0)
							.should('have.attr', 'data-field-id', secondId);
						cy.get('[data-testid="cfp-field"]').eq(0).should('contain', 'Second question');

						cy.wait('@slowMove');
						cy.get('[data-testid="cfp-field"]')
							.eq(0)
							.should('have.attr', 'data-field-id', secondId);
						cy.get('[data-testid="cfp-field"]').eq(0).should('contain', 'Second question');
						cy.wrap(firstId).should('not.eq', secondId);
					});
			});
	});

	it('rolls the list back and shows the reason when the write is refused', () => {
		const slug = uniqueSlug();
		openCfp(slug);

		cy.get('[data-testid="cfp-field"]')
			.eq(0)
			.invoke('attr', 'data-field-id')
			.then((firstId) => {
				cy.get('[data-testid="cfp-field"]').eq(0).find('summary').click();

				cy.intercept(
					{ method: 'POST', url: new RegExp(`/manage/${slug}/cfp`) },
					{ statusCode: 500, body: 'nope' }
				).as('failedMove');

				cy.get('[data-testid="cfp-field"]')
					.eq(0)
					.find('[data-testid="cfp-field-move-down"]')
					.click();

				cy.wait('@failedMove');
				cy.get('[data-testid="cfp-field"]').eq(0).should('have.attr', 'data-field-id', firstId);
				cy.get('[data-testid="cfp-field"]').eq(0).should('contain', 'First question');
				cy.get('[data-testid="cfp-reorder-error"]').should('be.visible');
			});
	});

	it('keeps the clicked order when a second row moves while the first is in flight', () => {
		const slug = uniqueSlug();
		openCfp(slug);
		addField('Third question');

		cy.get('[data-testid="cfp-field"]')
			.eq(0)
			.invoke('attr', 'data-field-id')
			.then((firstId) => {
				cy.get('[data-testid="cfp-field"]')
					.eq(1)
					.invoke('attr', 'data-field-id')
					.then((secondId) => {
						cy.get('[data-testid="cfp-field"]')
							.eq(2)
							.invoke('attr', 'data-field-id')
							.then((thirdId) => {
								cy.get(`[data-field-id="${secondId}"]`).find('summary').click();
								cy.get(`[data-field-id="${thirdId}"]`).find('summary').click();

								cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/cfp`) }, (req) => {
									req.on('response', (res) => {
										res.setDelay(2500);
									});
								}).as('move');

								cy.get(`[data-field-id="${secondId}"]`)
									.find('[data-testid="cfp-field-move-up"]')
									.click();
								cy.get(`[data-field-id="${thirdId}"]`)
									.find('[data-testid="cfp-field-move-up"]')
									.click();

								cy.get('[data-testid="cfp-field"]', { timeout: 800 })
									.eq(0)
									.should('have.attr', 'data-field-id', secondId);
								cy.get('[data-testid="cfp-field"]')
									.eq(1)
									.should('have.attr', 'data-field-id', thirdId);

								cy.wait('@move');
								cy.wait('@move');
								cy.get('[data-testid="cfp-field"]')
									.eq(0)
									.should('have.attr', 'data-field-id', secondId);
								cy.get('[data-testid="cfp-field"]')
									.eq(1)
									.should('have.attr', 'data-field-id', thirdId);
								cy.get('[data-testid="cfp-field"]')
									.eq(2)
									.should('have.attr', 'data-field-id', firstId);
							});
					});
			});
	});

	it('applies the waiting move on the server list when the first write is refused', () => {
		const slug = uniqueSlug();
		openCfp(slug);
		addField('Third question');

		cy.get('[data-testid="cfp-field"]')
			.eq(0)
			.invoke('attr', 'data-field-id')
			.then((firstId) => {
				cy.get('[data-testid="cfp-field"]')
					.eq(1)
					.invoke('attr', 'data-field-id')
					.then((secondId) => {
						cy.get('[data-testid="cfp-field"]')
							.eq(2)
							.invoke('attr', 'data-field-id')
							.then((thirdId) => {
								cy.get(`[data-field-id="${secondId}"]`).find('summary').click();
								cy.get(`[data-field-id="${thirdId}"]`).find('summary').click();

								let seen = 0;
								cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/cfp`) }, (req) => {
									seen += 1;
									if (seen === 1) {
										req.reply({ statusCode: 500, delay: 2500, body: 'nope' });
										return;
									}
									req.continue();
								}).as('moves');

								cy.get(`[data-field-id="${secondId}"]`)
									.find('[data-testid="cfp-field-move-up"]')
									.click();
								cy.get(`[data-field-id="${thirdId}"]`)
									.find('[data-testid="cfp-field-move-up"]')
									.click();

								cy.wait('@moves');
								cy.wait('@moves');
								cy.get('[data-testid="cfp-field"]')
									.eq(0)
									.should('have.attr', 'data-field-id', firstId);
								cy.get('[data-testid="cfp-field"]')
									.eq(1)
									.should('have.attr', 'data-field-id', thirdId);
								cy.get('[data-testid="cfp-field"]')
									.eq(2)
									.should('have.attr', 'data-field-id', secondId);
							});
					});
			});
	});
});
