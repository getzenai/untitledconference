/**
 * #717: on a phone, Talks opened on search, filters, and an empty bulk
 * strip with a grey Accept. The pile started below the fold.
 *
 * The empty strip hides below `md` until a row is selected. Desktop keeps
 * it. Only a real viewport can prove a title is on the first screen, not
 * merely in the document.
 */
const uniqueSlug = () => `subs717-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const TALK = 'First talk on the pile';

describe('Talks on a phone', () => {
	it('shows a talk title in the first viewport and still decides after a selection', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK, 'Second talk', 'Third talk'],
					sessionStatus: 'submitted',
					committee: true
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();

		cy.get('[data-testid="bulk-toolbar"]').should('not.be.visible');

		// In the viewport, not merely in the DOM. A title below the fold is
		// the bug this spec exists to catch.
		cy.contains('tbody a', TALK).should(($title) => {
			const box = $title[0].getBoundingClientRect();
			expect(box.bottom, 'the title reaches into the first screen').to.be.greaterThan(0);
			expect(box.top, 'the title is not below the fold').to.be.lessThan(PHONE.height);
		});

		cy.get(`input[aria-label="Select ${TALK}"]`).check();

		cy.get('[data-testid="bulk-toolbar"]').should('be.visible');
		cy.contains('button[name="decision"]', 'Accept').should('be.visible').and('not.be.disabled');
		cy.contains('button[name="decision"]', 'Decline').should('be.visible').and('not.be.disabled');
		cy.get('[data-testid="bulk-assign-open"]').should('be.visible').and('not.be.disabled');

		cy.contains('button[name="decision"]', 'Decline').click();
		cy.get('[data-testid="bulk-decide-confirm"]').click();
		cy.contains('tbody tr', TALK).find('[data-status="rejected"]').should('exist');
	});

	it('keeps the empty bulk strip on desktop', () => {
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
					sessionStatus: 'submitted'
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();

		cy.get('[data-testid="bulk-toolbar"]').should('be.visible');
		cy.contains('button[name="decision"]', 'Accept').should('be.visible').and('be.disabled');
		cy.contains('tbody a', TALK).should('be.visible');
	});
});
