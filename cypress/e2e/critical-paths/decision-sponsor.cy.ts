/**
 * #450: a sponsor talk is a fact on the decision list, not a click away.
 *
 * The marker is set on the submission and must survive a reload onto the
 * room where the committee decides. Naming it is the whole feature — a
 * sponsor talk is not an automatic accept and not an automatic reject.
 */
const uniqueSlug = () => `dec450-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A sponsored talk';

describe('The decision list names a sponsor talk without opening it', () => {
	it('keeps the marker from the detail view onto the decision list', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK],
					sessionStatus: 'submitted',
					reviewed: [TALK]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get(
			'[data-testid="settings-sponsors"] form[action="?/addSponsorTier"] input[name="name"]'
		).type('Gold');
		cy.get('[data-testid="settings-sponsors"]').contains('button', 'Add tier').click();
		cy.get('[data-testid="settings-sponsor-row"][data-name="Gold"]').should('exist');

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.chooseFromAppSelect('sponsor-tier-select', 'Gold');
		cy.contains('button', 'Save marker').click();
		cy.contains('Sponsor tier saved.').should('exist');

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="submission-sponsor"]').should('contain', 'Gold');

		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();
		cy.get('[data-testid="lobbying-queue"]').within(() => {
			cy.contains(TALK).should('exist');
			cy.get('[data-testid="queue-sponsor"]').should('contain', 'Gold');
		});
	});
});
