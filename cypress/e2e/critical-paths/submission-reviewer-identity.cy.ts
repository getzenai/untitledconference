/**
 * Who the organizer sees in the reviews list of one submission (#416).
 *
 * The integration test pins what `submissionDetail` returns. Only a real page
 * proves the two halves of that page agree: the reviews list at the top and the
 * assignment block below it name the same person. That disagreement was the bug —
 * "Reviewer 1" above, the reviewer's name and email below — and it is invisible
 * to any test that looks at one of the two.
 *
 * The round here is blind, which is the case that used to be renamed.
 */
const uniqueSlug = () => `revid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Reviewer identity on the submission page', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Blind talk'],
					sessionStatus: 'submitted',
					reviewed: ['Blind talk'],
					blindReview: true
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('names the reviewer of a blind round and says the round is blind', () => {
		cy.viewport(1600, 900);
		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('tbody tr', 'Blind talk').find('a').first().click();

		// The label the peer surface uses must not be here. Asserted as the pattern,
		// not as one string: "Reviewer 2" would be the same bug.
		cy.get('[data-testid="submission-reviews"] [data-testid="review-reviewer-name"]')
			.invoke('text')
			.then((raw) => {
				const shown = raw.trim();
				expect(shown).not.to.match(/^Reviewer \d+$/);
				// Not empty either: a blank line would satisfy "not Reviewer 1" and
				// answer the question no better than the number did.
				expect(shown).not.to.eq('');

				// The two halves of the page agree, which is the whole point: the
				// reviews list and the assignment block point at the same person.
				// Matched against the block's text rather than its name element,
				// because an account with no name is identified there by its address.
				cy.get('[data-testid="review-assignments"]').should('contain.text', shown);
			});

		cy.get('[data-testid="review-blind-round"]').should('be.visible');

		cy.screenshot('416-submission-reviews-named', { capture: 'viewport' });
	});
});
