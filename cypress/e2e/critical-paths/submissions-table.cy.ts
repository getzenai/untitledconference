/**
 * The organizer's submissions table, at two window widths.
 *
 * Both things checked here are invisible to a unit test on purpose:
 *
 *  1. **The sideways-scroll hint appears only when the table really is cut off.**
 *     It is driven by a ResizeObserver comparing `scrollWidth` to `clientWidth`,
 *     which means it needs layout — a server-rendered string has no width, and
 *     the unit suite has no DOM at all. A breakpoint would have been testable and
 *     wrong: nine columns do not fit in a narrow desktop window either.
 *  2. **Sorting by title survives the round trip through the loader.** The unit
 *     test pins the links the header emits; only a real navigation proves the
 *     server reads the parameter and the rows actually come back in that order.
 *
 * The third click is asserted too, because it is the one that is easy to lose:
 * a two-state toggle leaves an organizer with no way back to the default order.
 */
const uniqueSlug = () => `subs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const WIDE = { width: 1600, height: 900 };
const PHONE = { width: 390, height: 844 };

describe('Submissions table', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			// Titles chosen so that alphabetical and newest-first disagree: sorted
			// A–Z gives Alpha, Middle, Zeta, and the fixture inserts them in the
			// opposite order. Without that disagreement a broken sort would pass.
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Zeta talk', 'Middle talk', 'Alpha talk']
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('hides the scroll hint on a wide window and shows it on a phone', () => {
		cy.viewport(WIDE.width, WIDE.height);
		cy.visit(`/manage/${slug}/submissions`);

		// Precondition: the table is really there. Otherwise "no hint" would pass on
		// an empty page, which is the classic way this kind of spec goes green for
		// the wrong reason.
		cy.get('tbody tr').should('have.length', 3);
		cy.get('[data-testid="scroll-hint"]').should('not.exist');

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="scroll-hint"]').should('be.visible');

		// And the columns it points at are genuinely reachable rather than clipped:
		// the last header can be scrolled to.
		cy.contains('th', 'Notification').scrollIntoView().should('be.visible');
	});

	it('sorts by title through the server and cycles back to the default', () => {
		cy.viewport(WIDE.width, WIDE.height);
		cy.visit(`/manage/${slug}/submissions`);

		cy.get('[data-testid="sort-by-title"]').click();
		cy.url().should('include', 'sort=title-asc');
		cy.get('tbody tr').first().should('contain', 'Alpha talk');
		cy.get('tbody tr').last().should('contain', 'Zeta talk');

		cy.get('[data-testid="sort-by-title"]').click();
		cy.url().should('include', 'sort=title-desc');
		cy.get('tbody tr').first().should('contain', 'Zeta talk');

		// The way out. `sort` leaves the URL entirely rather than becoming
		// `sort=newest`, so the default order has exactly one address.
		cy.get('[data-testid="sort-by-title"]').click();
		cy.url().should('not.include', 'sort=');
	});
});
