/**
 * Submit proposal must say which organizer question is missing (#493).
 *
 * A speaker who filled title, abstract and their name, then clicked, used to
 * get nothing: no message, no focus, no highlight. The missing field is a
 * question the organizer added, in a block nobody reads as "required", and
 * the row never landed. The server already named the question; the form
 * printed that only next to the field, while they were still looking at the
 * button.
 *
 * A unit test can see the summary in the markup. It cannot see the focus
 * jump, or that the typed abstract is still there after the rejected POST.
 */
const uniqueSlug = () => `cfp-required-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A required organizer question left unanswered', () => {
	it('names the question, focuses it, and keeps what was typed', () => {
		const slug = uniqueSlug();
		const abstract = 'The queue used to swallow this paragraph when the button did nothing.';
		const question = 'Have you given this talk before?';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
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

		cy.contains('h3', 'Add a field')
			.parent()
			.within(() => {
				cy.get('input[name="label"]').type(question);
				cy.get('[data-testid="app-select-kind"]').click();
			});
		cy.get('[role="option"]').contains('Yes / no').click();
		cy.contains('h3', 'Add a field')
			.parent()
			.within(() => {
				cy.get('input[name="required"]').check();
				cy.contains('button', 'Add field').click();
			});
		cy.contains('li', question).should('exist');

		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.logout();

		cy.createAndLogin().then((speaker) => {
			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();

			cy.get('input[name="title"]').clear().type('A talk the button used to swallow');
			cy.get('textarea[name="abstract"]').clear().type(abstract);
			cy.get('input[name="keyTakeaway"]').clear().type('The form has to say what is missing.');
			cy.get('input[name="speakerName"]').clear().type('Ada Bennett');
			cy.get('input[name="speakerEmail"]').clear().type(speaker.email);

			cy.contains('button', 'Submit proposal').click();

			cy.location('pathname').should('eq', `/c/${slug}/cfp`);
			cy.get('[data-testid="proposal-errors"]')
				.should('be.visible')
				.and('contain', question)
				.and('contain', 'is required');

			cy.focused()
				.should('have.attr', 'data-testid')
				.and('match', /^app-select-answer:/);

			cy.get('textarea[name="abstract"]').should('have.value', abstract);
			cy.contains('button', 'Submit proposal').should('not.be.disabled');
		});
	});
});
