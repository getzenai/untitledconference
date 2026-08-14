/**
 * The close date on the public call is something a submitter can put in a
 * calendar (#510). A unit test pins the VEVENT; this spec is the other half of
 * the done-when: the control is on the page a submitter actually reads.
 */
const uniqueSlug = () => `cfp-deadline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The public call close date', () => {
	it('offers a one-event calendar a logged-out submitter can download', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					name: 'Deadline Conf',
					days: ['2028-05-10'],
					sessions: []
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();

		// The hidden input is derived state — writing it from Cypress does not
		// survive the next render. The picker is the same path an organizer uses
		// (#124), and a 2028 day keeps the call open regardless of when this runs.
		cy.get('[data-testid="datetime-picker-closesAt"]').click();
		cy.get('[data-testid="datetime-picker-calendar-closesAt"] select').last().select('2028');
		cy.get('[data-testid="datetime-picker-calendar-closesAt"]')
			.find('[data-bits-day]:not([data-outside-month]):not([data-disabled])')
			.first()
			.click();
		cy.get('[data-testid="datetime-picker-time-closesAt"]').clear().type('23:59');
		cy.get('[data-testid="datetime-picker-closesAt"]').click();

		cy.contains('button', 'Save settings').click();
		cy.contains('Call for papers updated.').should('exist');
		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.logout();

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();

		cy.contains('Proposals close').should('exist');
		cy.get('[data-testid="cfp-deadline-calendar"]')
			.should('be.visible')
			.and('have.attr', 'href', `/c/${slug}/cfp.ics`)
			.then(($link) => {
				cy.request($link.attr('href')!).then((response) => {
					expect(response.status).to.eq(200);
					expect(response.headers['content-type']).to.include('text/calendar');
					expect(response.headers['content-disposition']).to.match(
						/attachment; filename="Deadline-Conf-.*\.ics"/
					);
					expect(response.body).to.include('BEGIN:VEVENT');
					expect(response.body).to.include('END:VEVENT');
					expect(response.body).to.include('DTEND:');
					expect(response.body).to.include(`/c/${slug}/cfp`);
				});
			});
	});
});
