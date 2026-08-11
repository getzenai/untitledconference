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
