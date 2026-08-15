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

	/**
	 * The other half of ABS-01, and the one the rubric calls a `rule`: a date that a
	 * POST goes straight through is a note. The service test pins `saveReview`'s
	 * refusal; this spec proves the whole chain in a browser — the organizer sees the
	 * round as closed, the reviewer's queue says so instead of "To review", the form
	 * explains itself, and a request that ignores all of that is still refused.
	 */
	it('shuts a closed round for the reviewer, on the page and on the POST', () => {
		const slug = uniqueSlug();
		// A form POST from outside the browser still has to look like it came from the
		// app: SvelteKit answers 403 to a form-encoded request with no matching origin.
		const sameOrigin = { origin: Cypress.config('baseUrl') as string };
		// `accept: text/html` asks for the no-JS path, where the refusal is the HTTP
		// status. Without it SvelteKit answers 200 with the failure inside an
		// ActionResult body, and the status would prove nothing.
		const asBrowser = { ...sameOrigin, accept: 'text/html' };
		const closedYesterday = new Date(Date.now() - 86_400_000).toISOString();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Too late to review']
				}
			})
				.its('status')
				.should('eq', 200);

			// The round starts without a window, so the run below can show the same POST
			// being taken and then refused. A spec that only ever sees a 409 cannot tell
			// enforcement from a request that was broken all along.
			cy.visit(`/manage/${slug}/rounds`);
			cy.waitForHydration();
			cy.get('form[action="?/add"] input[name="name"]').type('Screening');
			cy.contains('button[type="submit"]', 'Add round').click();
			cy.get('[data-testid="round-summary"]').should('contain.text', 'Open');

			// The organizer reviews their own conference here: the invite round trip is
			// the neighbouring spec's subject, and repeating it would only add minutes.
			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

			cy.visit(`/manage/${slug}/submissions`);
			cy.contains('a', 'Too late to review').click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email)
				.contains('button', 'Assign')
				.click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email).should(
				'contain.text',
				'Unassign'
			);

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();
			cy.contains('td', 'To review').should('exist');
			cy.contains('a', 'Too late to review').click();
			cy.waitForHydration();
			cy.get('[data-testid="round-window-notice"]').should('not.exist');
			cy.contains('button', 'Submit review').should('not.be.disabled');

			// The same POST twice, on either side of the close. This is the one the
			// round's dates are worth nothing without.
			cy.url().then((reviewUrl) => {
				const file = (body: Record<string, string>) =>
					cy.request({
						method: 'POST',
						url: `${reviewUrl}?/save`,
						form: true,
						headers: asBrowser,
						body,
						failOnStatusCode: false
					});

				file({ intent: 'draft', comment: 'While the round was running' })
					.its('status')
					.should('eq', 200);

				// Closed by hand rather than by picker: a day in the past cannot be
				// clicked deterministically, and the picker is the test above's subject.
				cy.visit(`/manage/${slug}/rounds`);
				cy.waitForHydration();
				cy.get('[data-testid="round-row"]')
					.invoke('attr', 'data-round-id')
					.then((roundId) => {
						cy.request({
							method: 'POST',
							url: `${Cypress.config('baseUrl')}/manage/${slug}/rounds?/rename`,
							form: true,
							headers: sameOrigin,
							body: { id: roundId!, name: 'Screening', closesAt: closedYesterday }
						})
							.its('status')
							.should('eq', 200);

						// The organizer reads the state without doing the date arithmetic.
						cy.reload();
						cy.waitForHydration();
						cy.get('[data-testid="round-summary"]').should('contain.text', 'Closed');

						cy.visit(`/review/${slug}`);
						cy.waitForHydration();
						// "To review" would be an instruction nobody can follow.
						cy.contains('td', 'To review').should('not.exist');
						cy.contains('Closed').should('exist');

						cy.contains('a', 'Too late to review').click();
						cy.waitForHydration();
						cy.get('[data-testid="round-window-notice"]').should('contain.text', 'closed');
						cy.contains('button', 'Submit review').should('be.disabled');
						cy.contains('button', 'Save progress').should('be.disabled');

						// And the request that never saw any of that.
						file({ intent: 'submit', comment: 'Filed anyway' }).its('status').should('eq', 409);
					});
			});
		});
	});
});
