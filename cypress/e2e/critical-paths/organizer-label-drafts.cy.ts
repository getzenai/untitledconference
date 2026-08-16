/**
 * #761/#762/#766: organizer names and labels should survive the ordinary
 * decision to look somewhere else before saving. Reopening and then reloading
 * distinguishes a browser draft from a value that merely stayed alive in the
 * old component.
 *
 * #762 is the label only — the scorecard storage path is Grok's.
 */
const uniqueSlug = () => `org-labels-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Organizer name and label drafts', () => {
	it('keeps the organization name through a sidebar click and reload', () => {
		const organizationName = `Label Org ${Date.now()}`;
		const typed = `${organizationName} renamed`;

		cy.createAndLogin({ organizationName }).then(() => {
			cy.setActiveOrganization(organizationName);
		});

		cy.visit('/settings/organization');
		cy.waitForHydration();
		cy.get('[data-testid="organization-name"]').clear().type(typed);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit('/settings/organization');
		cy.waitForHydration();
		cy.get('[data-testid="organization-name-restored"]').should('be.visible');
		cy.get('[data-testid="organization-name"]').should('have.value', typed);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="organization-name"]').should('have.value', typed);
	});

	it('keeps a new scorecard criterion label through a sidebar click and reload', () => {
		const slug = uniqueSlug();
		const typed = 'ORGJOURNEY criterion draft';

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
		cy.get('[data-testid="add-criterion-label"]').type(typed);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit(`/manage/${slug}/rounds`);
		cy.waitForHydration();
		cy.get('[data-testid="add-criterion-label-restored"]').should('be.visible');
		cy.get('[data-testid="add-criterion-label"]').should('have.value', typed);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="add-criterion-label"]').should('have.value', typed);
	});

	it('keeps a rejected scorecard criterion label through reload', () => {
		const slug = uniqueSlug();
		const typed = 'ORGJOURNEY rejected criterion';

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

		// Select with one option is valid HTML and a 400 from the server —
		// this must not take the success path with a different name.
		cy.chooseFromAppSelect('add-criterion-kind', 'Select');
		cy.get('[data-testid="add-criterion-options"]').type('Only one');
		cy.get('[data-testid="add-criterion-label"]').type(typed);
		cy.get('[data-testid="add-criterion-submit"]').click();

		cy.contains('A select criterion needs at least two options.').should('be.visible');
		cy.get('[data-testid="add-criterion-label"]').should('have.value', typed);
		cy.get('form[action="?/updateCriterion"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="add-criterion-label-restored"]').should('be.visible');
		cy.get('[data-testid="add-criterion-label"]').should('have.value', typed);
		cy.get('form[action="?/updateCriterion"]').should('not.exist');
	});

	it('keeps a CFP field label through a sidebar click and reload', () => {
		const slug = uniqueSlug();
		const typed = 'ORGJOURNEY field draft';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.get('form[action="?/addField"] [data-testid="cfp-field-label"]').type(typed);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('form[action="?/addField"] [data-testid="cfp-field-label-restored"]').should(
			'be.visible'
		);
		cy.get('form[action="?/addField"] [data-testid="cfp-field-label"]').should('have.value', typed);

		cy.reload();
		cy.waitForHydration();
		cy.get('form[action="?/addField"] [data-testid="cfp-field-label"]').should('have.value', typed);
	});
});
