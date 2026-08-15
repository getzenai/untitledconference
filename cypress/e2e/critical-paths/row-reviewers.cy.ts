/**
 * #414: who is on the talk, without opening the talk.
 *
 * Two claims, both of them things a unit test cannot see. The chips have to
 * survive the real loader — the names come off the same query as the count, so
 * a row saying 0/2 next to one chip would be a bug the fixture cannot produce.
 * And the round picker has to keep a long name inside its box at both the
 * width an organizer works at and the width they check the queue at.
 */
const uniqueSlug = () => `row414-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALKS = ['A staffed talk', 'An untouched talk'];
const LONG_ROUND = 'Programme committee, second pass';

/** True while the trigger is showing less than it holds — text spilling out. */
const fitsInside = (element: JQuery<HTMLElement>) => {
	const node = element[0];
	expect(node.scrollWidth, `${node.scrollWidth} <= ${node.clientWidth}`).to.be.at.most(
		node.clientWidth + 1
	);
};

describe('Assigned reviewers on the submissions row', () => {
	it('names them in the row and keeps a long round name in its control', () => {
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
							sessions: TALKS,
							sessionStatus: 'submitted'
						}
					})
						.its('status')
						.should('eq', 200);

					for (const reviewer of [first, second]) {
						cy.visit(`/manage/${slug}/people`);
						cy.waitForHydration();
						cy.get('form[action="?/addReviewer"] input[name="email"]').type(reviewer.email);
						cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
						cy.get('[data-testid="people-committee"]').should('contain.text', reviewer.email);
					}

					// A round named the way committees actually name them — this is the
					// label that used to run out of the picker.
					cy.visit(`/manage/${slug}/rounds`);
					cy.waitForHydration();
					cy.get('form[action="?/add"] input[name="name"]').type(LONG_ROUND);
					cy.contains('button[type="submit"]', 'Add round').click();
					cy.get('form[action="?/rename"] input[name="name"]').should('have.value', LONG_ROUND);

					cy.visit(`/manage/${slug}/submissions`);
					cy.waitForHydration();
					cy.contains('tbody tr', TALKS[0]).find('input[type="checkbox"]').check();

					cy.get('[data-testid="bulk-assign-open"]').click();
					cy.get('[data-testid="bulk-assign-dialog"]').should('be.visible');

					cy.get('[data-testid="bulk-assign-round"]').click();
					cy.get('[role="option"]').contains(LONG_ROUND).click();
					// Chosen, shown truncated, and still readable in full on hover.
					cy.get('[data-testid="bulk-assign-round"]')
						.should('have.attr', 'title', LONG_ROUND)
						.then(fitsInside);

					cy.get('[data-testid="bulk-assign-reviewers"] input[type="checkbox"]').check({
						force: true
					});
					cy.get('[data-testid="bulk-assign-submit"]').click();
					cy.get('[data-testid="bulk-assign-message"]').should(
						'contain.text',
						'2 assignments created'
					);

					// The point of the issue: the row itself now says who, and the
					// count beside it agrees with how many chips there are.
					cy.contains('tbody tr', TALKS[0]).within(() => {
						cy.get('[data-testid="reviews-cell"]').should('contain.text', '0/2');
						cy.get('[data-testid="row-reviewers"] > span').should('have.length', 2);
					});
					cy.contains('tbody tr', TALKS[0])
						.find('[data-testid="row-reviewers"]')
						.should('contain.text', 'not handed in');

					// A talk nobody was asked about says nothing rather than 0 chips
					// in an empty box.
					cy.contains('tbody tr', TALKS[1]).within(() => {
						cy.get('[data-testid="reviews-cell"]').should('contain.text', '0/0');
						cy.get('[data-testid="row-reviewers"]').should('not.exist');
					});

					// And the same control on a phone, where it has the least room.
					cy.viewport(390, 844);
					cy.reload();
					cy.waitForHydration();
					cy.contains('tbody tr', TALKS[0]).find('input[type="checkbox"]').check();
					cy.get('[data-testid="bulk-assign-open"]').click();
					cy.get('[data-testid="bulk-assign-round"]').click();
					cy.get('[role="option"]').contains(LONG_ROUND).click();
					cy.get('[data-testid="bulk-assign-round"]').then(fitsInside);
				});
			});
		});
	});
});
