/**
 * One long title must not cost the other thirty rows (#470).
 *
 * A ~620-character title went in through "Edit talk" and the submissions table
 * then pushed Speaker, Track, Score, Status and Notification off the screen for
 * every row. Two separate faults, both only visible in a browser:
 *
 *  1. The title cell had no ceiling, so the widest row set the column width.
 *  2. `Sidebar.Inset` is a flex item and a flex item's `min-width` is `auto`, so
 *     the wide table made the whole column wider than the viewport. The
 *     *document* scrolled sideways and the fixed rail slid out of view for good
 *     — "Dashboard" read "ashboard", and nothing scrolled it back.
 *
 * The title is seeded straight into the database on purpose: the input limit
 * added alongside this stops a *new* one being typed, and the rows already
 * stored have to render anyway.
 */
const LONG_TITLE = `Scaling ${'the-observability-story-nobody-asked-for-'.repeat(14)}end`;

const documentOverflow = () =>
	cy.document().then((doc) => doc.documentElement.scrollWidth - doc.documentElement.clientWidth);

describe('a submissions table holding one very long title', () => {
	it('keeps the sideways scroll off the document and the rail on screen', () => {
		const slug = `wide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

		// 1024 is the width the issue was reported at.
		cy.viewport(1024, 768);
		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					days: ['2028-05-10'],
					sessions: [LONG_TITLE, 'A normal talk', 'Another normal talk']
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();

		// The row is there and carries its full text for anyone who wants it —
		// truncation is a rendering decision, not a data one.
		cy.contains('a[title]', 'Scaling the-observability').should('have.attr', 'title', LONG_TITLE);

		documentOverflow().should('be.lte', 1);

		cy.get('[data-testid="conference-sidebar"]').then(($rail) => {
			expect($rail[0].getBoundingClientRect().left).to.be.gte(0);
		});

		// The columns the organizer came for are reachable inside the table's own
		// box, which is what ScrollTable is for.
		cy.contains('th', 'Notification').should('exist');
	});
});
