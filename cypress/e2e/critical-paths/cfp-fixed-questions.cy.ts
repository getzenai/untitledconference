/**
 * What the call-for-papers builder says about the form it is building (#126).
 *
 * Fabian read the builder as "I have to configure the obvious things myself",
 * and he read it correctly: the page said a form with no fields collects
 * nothing but a title, while title, abstract, format, track and the whole
 * speaker block are hard-coded in the submitter's form and always asked.
 *
 * The SSR test beside the page proves the wording. This runs in a browser for
 * the reason #141 taught us: a list rendered from a constant is exactly the
 * shape that hydrates badly, and a page that dies after hydration still serves
 * perfect markup to anything that only reads the response.
 */
const uniqueSlug = () => `cfp-fixed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The always-asked questions in the CFP builder', () => {
	it('names them on a form that was just created, and shows them in the preview', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();

		// A brand new form: no fields configured, which used to be the state the
		// page described as collecting nothing.
		cy.get('[data-testid="cfp-fixed-questions"]')
			.should('contain.text', 'Title')
			.and('contain.text', 'Abstract')
			.and('contain.text', 'Short bio');

		cy.contains('A form with no fields collects nothing').should('not.exist');
		cy.contains('Nothing to fill in yet').should('not.exist');

		// The preview is the organizer's picture of the submitter's screen, so the
		// fixed half has to be in it too — and the page has to survive rendering
		// both lists at once.
		cy.contains('h3', 'About the speaker').should('exist');
	});
});

/**
 * Removing one of them, and meeting the result as a submitter (#159).
 *
 * Fabian's complaint was that the form is not fully configurable. The unit
 * tests prove the markup and the integration tests prove the server, but the
 * question he actually asked — "can I take this off my form?" — is only
 * answered by clicking it off in one screen and finding it gone in another.
 */
describe('Removing a standard question', () => {
	it('takes it off the builder, the preview and the public form', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();

		cy.get('[data-testid="fixed-question-keyTakeaway"]')
			.should('have.attr', 'data-shown', 'true')
			.contains('button', 'Remove')
			.click();

		// The row turns into its own undo, rather than the question vanishing from
		// a screen whose whole job is to say what the form asks.
		cy.get('[data-testid="fixed-question-keyTakeaway"]')
			.should('have.attr', 'data-shown', 'false')
			.and('contain.text', 'Add back');

		// The preview is the half an organizer believes.
		cy.contains('h2', 'What the submitter sees')
			.parent()
			.should('not.contain.text', 'Key takeaway');

		// The title cannot go, and says why instead of offering a dead button.
		cy.get('[data-testid="fixed-question-title"]')
			.should('not.contain.text', 'Remove')
			.and('contain.text', 'title');

		// It is a stored decision, not a toggle that lives in this tab.
		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="fixed-question-keyTakeaway"]').should('have.attr', 'data-shown', 'false');

		cy.get('[data-testid="fixed-question-keyTakeaway"]').contains('button', 'Add back').click();
		cy.get('[data-testid="fixed-question-keyTakeaway"]').should('have.attr', 'data-shown', 'true');
	});
});

/**
 * The public form is covered by `proposal-form.unit.test.ts` (the control is not
 * rendered) and by `fixed-questions.integration.test.ts` (the server neither
 * requires nor stores it). What is left for a browser is the builder's own round
 * trip, which is what this file already runs.
 */
