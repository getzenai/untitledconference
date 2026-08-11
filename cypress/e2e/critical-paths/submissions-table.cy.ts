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
 *  3. **Export is the filtered organizer view as a real download.** The route and
 *     query helper have separate tests; only clicking the table action proves the
 *     browser carries its session, filters and sort all the way to the CSV response.
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
					sessions: ['Zeta talk', 'Middle talk', 'Alpha talk'],
					// One track, on 'Zeta talk' only — a track filter that ignores its
					// parameter returns all three and is caught.
					tracks: ['Platform'],
					// One of the three carries a handed-in review, so the still-to-review
					// filter (#122) has something to leave out. A pile where every row is
					// alike would let a filter that does nothing pass.
					reviewed: ['Alpha talk']
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

	/**
	 * What is left to review (#122).
	 *
	 * Both halves need a pile where some talks are reviewed and some are not, which
	 * is why the fixture files one review. Only a real navigation can prove that the
	 * checkbox becomes a query parameter, the loader reads it, and the rows that
	 * come back are the right ones — the unit test can only prove the control is on
	 * the page.
	 */
	describe('still to review', () => {
		beforeEach(() => {
			cy.viewport(WIDE.width, WIDE.height);
			cy.visit(`/manage/${slug}/submissions`);
			// The checkbox applies itself through `onchange` on the filter form, which
			// only exists once Svelte has hydrated. Cypress clicks as soon as the SSR
			// markup is on screen, and a change event fired before the handler is
			// attached goes nowhere — `check()` does not retry, so the whole test then
			// waits out its timeout on a URL that was never going to change. It hydrates
			// in time on a developer machine and loses the race on a loaded CI runner,
			// which is the worst shape a flake can have.
			//
			// Waiting for the marker rather than re-clicking until the URL moves, on
			// purpose: a retry loop would also paper over the day this filter genuinely
			// stops applying, and that is the regression this spec exists to catch.
			//
			// The sort tests above need none of this — a column header is a real link
			// and works with no JavaScript at all.
			cy.waitForHydration();
		});

		it('filters the pile down to what nobody has reviewed', () => {
			// Precondition: all three are on screen first, or "two rows" below would
			// pass on a page that simply failed to load the third.
			cy.get('tbody tr').should('have.length', 3);

			cy.get('[data-testid="filter-needs-review"]').check();
			cy.url().should('include', 'needsReview=on');
			cy.get('tbody tr').should('have.length', 2);
			cy.contains('tbody tr', 'Alpha talk').should('not.exist');

			// The count in the header is the same question asked a second way, and the
			// two have to agree — they are separate queries over one expression.
			cy.get('[data-testid="unreviewed-count"]').should('contain.text', '2 unreviewed');
		});

		it('takes the same filter from the count in the header', () => {
			cy.get('[data-testid="unreviewed-count"]').click();
			cy.url().should('include', 'needsReview=on');
			cy.get('tbody tr').should('have.length', 2);
			cy.get('[data-testid="filter-needs-review"]').should('be.checked');
		});

		it('sorts by how many reviews are in, fewest first', () => {
			cy.get('[data-testid="sort-by-reviews"]').click();
			cy.url().should('include', 'sort=reviews-asc');
			// The reviewed one sinks to the bottom; the two untouched ones float up.
			cy.get('tbody tr').last().should('contain', 'Alpha talk');

			cy.get('[data-testid="sort-by-reviews"]').click();
			cy.url().should('include', 'sort=reviews-desc');
			cy.get('tbody tr').first().should('contain', 'Alpha talk');

			cy.get('[data-testid="sort-by-reviews"]').click();
			cy.url().should('not.include', 'sort=');
		});
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

	it('downloads the filtered organizer view as CSV (ABS-13)', () => {
		cy.viewport(WIDE.width, WIDE.height);
		cy.intercept('GET', `**/manage/${slug}/submissions/export.csv*`).as('csvExport');
		cy.visit(`/manage/${slug}/submissions?q=Alpha&sort=title-asc`);

		// The screen and file must answer the same question. Pin the screen first so a
		// CSV containing only Alpha cannot pass because the fixture itself was empty.
		cy.get('tbody tr').should('have.length', 1).and('contain', 'Alpha talk');
		cy.get('[data-testid="export-csv"]')
			.should('have.attr', 'href')
			.and('include', 'q=Alpha')
			.and('include', 'sort=title-asc');

		cy.get('[data-testid="export-csv"]').click();
		cy.wait('@csvExport').then(({ response }) => {
			expect(response?.statusCode).to.eq(200);
			expect(response?.headers['content-type']).to.include('text/csv');
			expect(response?.headers['content-disposition']).to.match(
				/^attachment; filename=".+-submissions-\d{4}-\d{2}-\d{2}\.csv"$/
			);
			expect(response?.headers['cache-control']).to.eq('private, no-store');

			const csv = String(response?.body);
			expect(csv).to.include('id,title,status,score');
			expect(csv).to.include('Alpha talk');
			expect(csv).not.to.include('Middle talk');
			expect(csv).not.to.include('Zeta talk');
		});
	});

	/**
	 * The filter row applies itself, and the app-drawn dropdown has to be part of
	 * that (#124).
	 *
	 * The row has no Filter button outside `<noscript>`: every control applies on
	 * the form's own `change` event, which reaches it because a native control
	 * dispatches one that bubbles. A shadcn select sets its hidden input
	 * programmatically and dispatches nothing, so this control can look perfect,
	 * pin its name in an SSR test, and quietly do nothing at all. That is exactly
	 * what it did on the first push of this branch.
	 */
	it('applies the track filter picked from the app dropdown', () => {
		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();

		cy.contains('Alpha talk').should('be.visible');

		cy.get('[data-testid="app-select-track"]').click();
		cy.get('[role="option"]').contains('Platform').click();

		// The filter is a GET form, so applying it is a navigation. Both halves
		// matter: the URL carries the choice, and the rows really narrow.
		cy.location('search').should('contain', 'track=');
		cy.contains('Zeta talk').should('be.visible');
		cy.contains('Alpha talk').should('not.exist');
	});
});
