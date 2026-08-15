/**
 * #447: asking them to resubmit is its own way out, not a decline wearing a note.
 *
 * The sentence has to survive a reload on the talk itself. Nothing is mailed.
 */
const uniqueSlug = () => `res447-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk we almost took';
const GUIDANCE = 'resubmit with your client on the proposal';
const NOTE = 'closest we had — bring the case study';

describe('An organizer asks a speaker to resubmit', () => {
	it('writes its own status and keeps the sentence through a reload', () => {
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

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.contains('a', TALK).click();
			cy.waitForHydration();

			cy.get('[data-testid="resubmit-guidance-text"]').type(GUIDANCE);
			cy.get('[data-testid="decide-resubmit"]').click();

			cy.get('[data-testid="submission-guidance"]').should('contain', GUIDANCE);
			cy.get('[data-status="resubmit_with_guidance"]').should('exist');

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="submission-guidance"]').should('contain', GUIDANCE);

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.contains('a', TALK).parents('tr').should('contain', 'Resubmit with guidance');
		});
	});

	it('keeps an optional champion sentence on a decline', () => {
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

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.contains('a', TALK).click();
			cy.waitForHydration();

			cy.get('[data-testid="decline-note-text"]').type(NOTE);
			cy.contains('button', 'Decline').click();

			cy.get('[data-testid="submission-decline-note"]').should('contain', NOTE);

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="submission-decline-note"]').should('contain', NOTE);
		});
	});
});
