/**
 * #890: the decision queue must not scroll the *document* sideways on a phone.
 *
 * The table has six columns and rendered 829px wide inside a 342px `section`
 * whose `overflow-x` was `visible`, so nothing owned that width and the page
 * itself scrolled. Measured live on `d12fdbb7`: `scrollLeft` 464 at 390.
 *
 * The assertion is `scrollLeft` after asking the page to scroll right, not
 * `scrollWidth`. `scrollWidth` is a stand-in and it lies in both directions:
 * content parked in its own scroll box inflates it without the page moving,
 * and it says nothing about whether a reader can actually be carried away
 * from the chrome. Scrolling and reading the offset back is the property.
 *
 * The 1280 line is the control. Without it a page that never scrolls at any
 * width — because the table stopped rendering, say — would satisfy the phone
 * assertion just as well.
 */
const uniqueSlug = () => `dec890-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALKS = ['Alpha talk', 'Beta talk'];

/** Ask the page to scroll right, then read how far it went. */
const documentScrollLeft = () =>
	cy.window().then((win) => {
		const scroller = win.document.scrollingElement!;
		scroller.scrollTo(9999, 0);
		const offset = scroller.scrollLeft;
		scroller.scrollTo(0, 0);
		return offset;
	});

describe('The decision queue on a phone', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: TALKS,
					sessionStatus: 'submitted',
					reviewed: TALKS
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps its width to itself instead of scrolling the page', () => {
		cy.viewport(390, 844);
		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();

		// The queue is on screen: an assertion about a page that failed to render
		// would pass for the wrong reason.
		cy.get('[data-testid="lobbying-queue"] tbody tr').should('have.length', TALKS.length);

		documentScrollLeft().should('eq', 0);

		// The table is still wide — it is supposed to be. The scroll belongs to
		// its own box, which is exactly what was missing.
		cy.get('[data-testid="lobbying-queue"]').should(($box) => {
			const viewport = $box[0].querySelector('div')!;
			expect(viewport.scrollWidth, 'the queue keeps its own sideways scroll').to.be.greaterThan(
				viewport.clientWidth
			);
		});

		cy.viewport(1280, 800);
		documentScrollLeft().should('eq', 0);

		// #470's surviving half: the fixed chrome must not be draggable off screen.
		cy.get('[data-sidebar="sidebar"]').should(($sidebar) => {
			expect(Math.round($sidebar[0].getBoundingClientRect().left)).to.be.lessThan(16);
		});
	});

	// The submissions table already sat in a `ScrollTable` and still moved the
	// page, which is what made the cause worth finding: the wrapper was doing
	// its job, and the `sr-only` span was going around it.
	it('leaves the page still on the submissions table too', () => {
		cy.viewport(390, 844);
		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.get('table tbody tr').should('have.length.at.least', 1);

		documentScrollLeft().should('eq', 0);

		cy.viewport(1280, 800);
		documentScrollLeft().should('eq', 0);
	});
});
