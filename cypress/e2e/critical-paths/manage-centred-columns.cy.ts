/**
 * #424: rounds, reviewer pool, embed & share and settings bound their column but
 * never centred it, so on a wide screen the whole page hugged the left edge and
 * the right half stayed empty.
 *
 * Only a browser can prove this one: the classes sit on the element either way,
 * what changed is where the box lands. So the spec measures the column's own
 * rectangle — and it measures it against its parent, not against the window,
 * because these pages live to the right of the conference rail. Centred in the
 * window and centred in the page are different boxes, and the second one is the
 * one an organizer sees.
 */
const uniqueSlug = () => `centred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PAGES = ['rounds', 'people', 'embed', 'settings'] as const;

/**
 * The gap left of the column matches the gap right of it, and there is a gap at
 * all — a column flush against the rail is the defect this closes.
 */
const expectCentredInParent = () =>
	cy.get('[data-testid="page-column"]').should(($column) => {
		const column = $column[0].getBoundingClientRect();
		const parent = $column[0].parentElement!.getBoundingClientRect();
		const left = column.left - parent.left;
		const right = parent.right - column.right;

		expect(left, 'the column has room on its left').to.be.greaterThan(40);
		expect(Math.abs(left - right), 'left and right margins match').to.be.lessThan(2);
	});

describe('The organizer pages centre their column', () => {
	it('centres wide, and fills the width on a phone', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: ['A talk'] }
			})
				.its('status')
				.should('eq', 200);

			cy.viewport(1440, 900);
			for (const page of PAGES) {
				cy.visit(`/manage/${slug}/${page}`);
				cy.waitForHydration();
				expectCentredInParent();
			}

			// Below the breakpoint nothing may change: the column is the page, and the
			// padding inside it is what keeps the text off the edge.
			cy.viewport(390, 844);
			for (const page of PAGES) {
				cy.visit(`/manage/${slug}/${page}`);
				cy.waitForHydration();
				cy.get('[data-testid="page-column"]').should(($column) => {
					const column = $column[0].getBoundingClientRect();
					const parent = $column[0].parentElement!.getBoundingClientRect();

					expect(column.left - parent.left, `${page}: no side margin on a phone`).to.be.lessThan(1);
					expect(column.width, `${page}: the column is the page`).to.be.closeTo(parent.width, 1);
				});
			}
		});
	});
});
