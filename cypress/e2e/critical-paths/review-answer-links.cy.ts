/**
 * #477: the recording link on the reviewer's screen is a link.
 *
 * The CFP form has no link field, so "Link to a recording or slides" comes back
 * as a text answer and was printed as body text — the only evidence of how a
 * speaker actually presents had to be selected and copied by hand, on the page
 * where somebody is scoring them.
 *
 * The unit suite pins the splitting. This is the click.
 */
const uniqueSlug = () => `rev-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The reviewer can click through to the evidence', () => {
	it('turns a URL in a text answer into an anchor, and leaves prose alone', () => {
		const slug = uniqueSlug();
		const talk = 'A talk with a recording';
		const recording = 'https://example.com/watch?v=abc123';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [talk],
					sessionStatus: 'submitted',
					reviewed: [talk],
					textAnswers: [
						{ label: 'Link to a recording or slides', value: `Watch it here: ${recording}.` },
						{ label: 'Why you', value: 'I have run this workshop for six years.' }
					]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/review/${slug}`);
		cy.waitForHydration();
		cy.contains('a', talk).click();
		cy.waitForHydration();

		// The link is real, opens away from the half-written review, and carries the
		// URL the submitter typed — not the sentence around it.
		cy.get('[data-testid="answer-link"]')
			.should('have.length', 1)
			.should('have.attr', 'href', recording)
			.should('have.attr', 'target', '_blank')
			.should('have.attr', 'rel')
			.and('contain', 'noopener');

		// The full stop belongs to the sentence, and the sentence is still readable.
		cy.contains('[data-testid="answer-text"]', 'Watch it here:').should('exist');
		cy.contains('[data-testid="answer-text"]', '.').should('exist');

		// An answer with no URL gains nothing it should not have.
		cy.contains('[data-testid="answer-text"]', 'I have run this workshop for six years.')
			.find('a')
			.should('not.exist');
	});
});
