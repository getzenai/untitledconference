/**
 * #721: assigning a reviewer paints the row before the action replies, and a
 * refused write puts the row back with a reason. The page used to reload.
 */
const uniqueSlug = () => `as721-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk waiting on a reviewer';

const openTalk = (slug: string) => {
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
				committee: true
			}
		})
			.its('status')
			.should('eq', 200);

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();
	});
};

const assignmentRow = () =>
	cy.get('[data-testid="review-assignments"] [data-testid="assignment-reviewer"]');

describe('Assigning a reviewer on a talk', () => {
	it('paints the row assigned before the action replies', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		assignmentRow().should('have.attr', 'data-reviewer-status', 'none');
		assignmentRow().contains('button', 'Assign').should('exist');

		cy.intercept({ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) }, (req) => {
			req.on('response', (res) => {
				res.setDelay(2500);
			});
		}).as('slowAssign');

		assignmentRow().contains('button', 'Assign').click();

		cy.get('[data-testid="review-assignments"] [data-testid="assignment-reviewer"]', {
			timeout: 800
		}).should('have.attr', 'data-reviewer-status', 'assigned');
		assignmentRow().contains('button', 'Unassign').should('exist');

		cy.wait('@slowAssign');
		assignmentRow().should('have.attr', 'data-reviewer-status', 'assigned');
		assignmentRow().contains('button', 'Unassign').should('exist');
	});

	it('rolls the row back and shows the reason when the write is refused', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		cy.intercept(
			{ method: 'POST', url: new RegExp(`/manage/${slug}/submissions/`) },
			{ statusCode: 500, body: 'nope' }
		).as('failedAssign');

		assignmentRow().contains('button', 'Assign').click();

		cy.wait('@failedAssign');
		assignmentRow().should('have.attr', 'data-reviewer-status', 'none');
		assignmentRow().contains('button', 'Assign').should('exist');
		cy.get('[data-testid="assignment-write-error"]').should('be.visible');
	});
});
