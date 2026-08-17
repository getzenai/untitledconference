/**
 * #897: the organizer speakers roster must not scroll the *document*
 * sideways on a phone.
 *
 * The table is `min-w-[40rem]` (640px) inside a wrapper whose `overflow-x`
 * was `visible`, so nothing owned that width and the page itself scrolled.
 * Measured live on `e990fb63`: `scrollLeft` 275 at 390, 0 at 1280.
 *
 * The assertion is `scrollLeft` after asking the page to scroll right, not
 * `scrollWidth`. `scrollWidth` cannot tell the two cases apart: content
 * parked in its own scroll box inflates it without the page moving
 * anywhere. 1280 is the control — a page that stopped rendering the table
 * would satisfy the phone line just as well.
 *
 * Two short rows would not prove the table is wide. Live is 42, so the
 * fixture is 42 speakers with long names and addresses — the columns have
 * to grow, the same way they do on the real roster.
 */
const uniqueSlug = () => `spk897-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ROSTER_SIZE = 42;

const csv = [
	'name,email',
	...Array.from({ length: ROSTER_SIZE }, (_, i) => {
		const n = String(i + 1).padStart(2, '0');
		return [
			`Speaker ${n} With A Long Professional Name From The Live Roster`,
			`speaker${n}-with-a-long-email-address@example.test`
		].join(',');
	})
].join('\n');

/** Ask the page to scroll right, then read how far it went. */
const documentScrollLeft = () =>
	cy.window().then((win) => {
		const scroller = win.document.scrollingElement!;
		scroller.scrollTo(9999, 0);
		const offset = scroller.scrollLeft;
		scroller.scrollTo(0, 0);
		return offset;
	});

describe('The speakers roster on a phone', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: [], sessions: [] }
			})
				.its('status')
				.should('eq', 200);

			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/import`,
				form: true,
				headers: { Origin: Cypress.config('baseUrl') },
				body: { csv }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps its width to itself instead of scrolling the page', () => {
		cy.viewport(390, 844);
		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();

		// The roster is on screen: an assertion about a page that failed to
		// render would pass for the wrong reason.
		cy.get('[data-testid="speaker-row"]').should('have.length', ROSTER_SIZE);

		documentScrollLeft().should('eq', 0);

		// The table is still wide — it is supposed to be. The scroll belongs
		// to its own box, which is exactly what was missing.
		cy.get('[data-testid="speakers-table"]').should(($box) => {
			const viewport = $box[0].querySelector('div')!;
			expect(viewport.scrollWidth, 'the roster keeps its own sideways scroll').to.be.greaterThan(
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
});
