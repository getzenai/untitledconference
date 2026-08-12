/**
 * ABS-01: a review round carries its own open/close window.
 *
 * The service test pins that the columns store and clear. This spec owns the half
 * only a browser can prove: that the picker's local wall time reaches the server as
 * the right instant, and that the round still shows the window after the reload an
 * organizer makes next. A date that lives only in the form is not a stored date.
 */
const uniqueSlug = () => `round-window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Review round window', () => {
	it('saves opens/closes on a round and redisplays them after a reload', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Windowed talk']
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/rounds`);
			cy.waitForHydration();

			// The add form's own window: a day from the calendar, a time typed beside it,
			// same controls the call for papers uses for its own deadline.
			cy.get('form[action="?/add"] input[name="name"]').type('Screening');
			cy.get('[data-testid="datetime-picker-closesAt"]').click();
			cy.get('[data-testid="datetime-picker-calendar-closesAt"]')
				.find('[data-bits-day]:not([data-outside-month]):not([data-disabled])')
				.first()
				.click();
			cy.get('[data-testid="datetime-picker-time-closesAt"]').clear().type('23:59');
			cy.get('[data-testid="datetime-picker-closesAt"]').click(); // close the popover
			cy.get('form[action="?/add"] input[name="closesAt"]')
				.invoke('val')
				.should('match', /^\d{4}-\d{2}-\d{2}T23:59$/);

			cy.contains('button[type="submit"]', 'Add round').click();

			// The summary line is where an organizer reads the window back without
			// opening a picker, so that is what has to survive the round trip.
			cy.get('[data-testid="round-summary"]').should('contain.text', '23:59');
			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="round-summary"]').should('contain.text', '23:59');
			cy.get('[data-testid="round-row"] input[name="closesAt"]')
				.invoke('val')
				.should('match', /^\d{4}-\d{2}-\d{2}T23:59$/);

			// Clearing it has to reach the column too: a date nobody can remove is
			// worse than one nobody set.
			cy.get('[data-testid="round-row"] [data-testid="datetime-picker-closesAt"]').click();
			cy.get('[data-testid="datetime-picker-clear-closesAt"]').click();
			cy.get('[data-testid="round-row"]').contains('button', 'Save').click();
			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="round-summary"]').should('contain.text', 'no dates set');
		});
	});
});
