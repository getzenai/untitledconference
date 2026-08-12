/**
 * ABS-09: chase several reviewers in one action.
 *
 * The service test pins the tally — queued, already queued, nothing outstanding.
 * What it cannot prove is that the selection on the dashboard reaches that
 * function as more than one id, and that the row a reminder has just been sent
 * for stops offering the checkbox that would send a second one.
 *
 * Two reviewers, one assigned submission each, so a bulk send that silently only
 * takes the first id would say "1 reminder queued" and fail here rather than
 * looking like a success.
 */
const uniqueSlug = () => `bulk-remind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Bulk review reminders', () => {
	it('reminds every selected reviewer at once and then offers nobody a second reminder', () => {
		const slug = uniqueSlug();

		cy.createTestUser().then((first) => {
			cy.createTestUser().then((second) => {
				cy.createAndLogin().then((organizer) => {
					cy.request({
						method: 'POST',
						url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
						body: {
							userId: organizer.id,
							slug,
							days: ['2028-05-10'],
							sessions: ['First talk', 'Second talk']
						}
					})
						.its('status')
						.should('eq', 200);

					// Both reviewers already have accounts, so they join the committee
					// directly instead of going through the invitation path.
					for (const reviewer of [first, second]) {
						cy.visit(`/manage/${slug}/people`);
						cy.waitForHydration();
						cy.get('form[action="?/addReviewer"] input[name="email"]').type(reviewer.email);
						cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
						cy.get('[data-testid="people-committee"]').should('contain.text', reviewer.email);
					}

					cy.visit(`/manage/${slug}/rounds`);
					cy.waitForHydration();
					cy.get('form[action="?/add"] input[name="name"]').type('Screening');
					cy.contains('button[type="submit"]', 'Add round').click();
					cy.get('form[action="?/rename"] input[name="name"]').should('have.value', 'Screening');

					// One submission each: the reminder only fires for a reviewer who owes
					// work, so both need something outstanding for the count to be two.
					const assign = (title: string, email: string) => {
						cy.visit(`/manage/${slug}/submissions`);
						cy.contains('a', title).click();
						cy.contains('[data-testid="review-assignments"] li', email)
							.contains('button', 'Assign')
							.click();
						cy.contains('[data-testid="review-assignments"] li', email).should(
							'contain.text',
							'Unassign'
						);
					};
					assign('First talk', first.email);
					assign('Second talk', second.email);

					cy.visit(`/manage/${slug}/dashboard`);
					cy.waitForHydration();

					cy.get('[data-testid="reminder-bulk-bar"]').should('exist');
					cy.get('[data-testid="send-reminders"]').should('be.disabled');
					cy.get('[data-testid="select-all-reviewers"]').click();
					cy.get('[data-testid="reminder-selected-count"]').should('contain.text', '2 selected');
					cy.get('[data-testid="send-reminders"]').click();

					cy.get('[data-testid="reminder-message"]').should('contain.text', '2 reminders queued');
					cy.get('[data-testid="reviewer-row"]')
						.filter(':contains("Reminder")')
						.should('have.length', 2);

					// Nobody is remindable any more, so the whole selection strip is gone
					// rather than sitting there offering a duplicate email.
					cy.get('[data-testid="reminder-bulk-bar"]').should('not.exist');
					cy.get('input[name="reviewerIds"]').should('not.exist');
					cy.contains('button', 'Send reminder').should('not.exist');
				});
			});
		});
	});
});
