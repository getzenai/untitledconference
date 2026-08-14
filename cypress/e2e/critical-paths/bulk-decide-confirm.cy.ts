/**
 * #409: the confirm dialog must be a gate, not a decoration.
 *
 * This is invisible to the unit suite on purpose. The unit test asserts the
 * dialog and the buttons are in the server-rendered markup, and they always
 * were — the defect lived in the order two submit listeners run in the browser.
 * `onsubmit` called `preventDefault()`, `use:enhance` had already registered its
 * own listener on the same form and never asks whether the event was cancelled,
 * so the decision was written while the dialog was still asking. Only a real
 * browser with real hydration can catch that.
 *
 * The load-bearing assertion is the one after Cancel: the rows are still
 * `submitted`. A test that only checks the dialog opens would have passed
 * against the broken build.
 */
const uniqueSlug = () => `dec409-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALKS = ['Keeper one', 'Keeper two', 'Keeper three'];

describe('Bulk decide asks before it decides', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: TALKS,
					sessionStatus: 'submitted'
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.get('input[name="id"]').check();
	});

	it('leaves every talk undecided when the organizer cancels', () => {
		cy.contains('button[name="decision"]', 'Decline').click();

		cy.get('[data-testid="bulk-decide-dialog"]').should('be.visible');
		// While the dialog is open, nothing may have been written yet.
		cy.get('[data-slot="status-badge"][data-status="rejected"]').should('not.exist');

		cy.get('[data-testid="bulk-decide-cancel"]').click();
		cy.get('[data-testid="bulk-decide-dialog"]').should('not.exist');

		// The reload is the honest check: a decision that reached the server would
		// come back with the page even if the table on screen still looked right.
		cy.reload();
		cy.get('[data-slot="status-badge"][data-status="submitted"]').should(
			'have.length',
			TALKS.length
		);
		cy.get('[data-slot="status-badge"][data-status="rejected"]').should('not.exist');
	});

	it('declines every selected talk once the organizer confirms', () => {
		cy.contains('button[name="decision"]', 'Decline').click();
		cy.get('[data-testid="bulk-decide-confirm"]').click();

		cy.get('[data-slot="status-badge"][data-status="rejected"]').should(
			'have.length',
			TALKS.length
		);

		cy.reload();
		cy.get('[data-slot="status-badge"][data-status="rejected"]').should(
			'have.length',
			TALKS.length
		);
	});
});
