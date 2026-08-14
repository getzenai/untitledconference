/**
 * The two sideways-scrolling strips on the public conference site (#393, #403).
 *
 * Both were reachable and neither said so. This spec asserts the pair of facts
 * that together make the hint honest, because either one alone is satisfiable by
 * a mistake: the strip really is wider than its box (`scrollWidth > clientWidth`),
 * and the mark is on screen. A component that always draws the mark passes the
 * second and fails the desktop case; one that never draws it fails the first.
 *
 * The room grid has two marks. The fade is the "more to the right" edge and
 * goes away at the end of the scroll. The sentence names the rooms that do not
 * fit, and stays, because rooms that do not fit are still off-screen after the
 * last column is visible. The tab strip keeps the fade only: there is no room
 * for a line of prose in the header.
 *
 * The rooms come from the organizer's own settings form and the placement from
 * the slot editor, the same way the agenda specs build a board: the public grid
 * only exists once something is scheduled on it, and a fixture that wrote
 * placements directly would be testing this file.
 */
const uniqueSlug = () => `scroll-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

describe('Sideways scrolling on the public site', () => {
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
					sessions: ['Fixture Talk A']
				}
			})
				.its('status')
				.should('eq', 200);
		});

		// A call for proposals, because its tab is the one that fell off the strip in
		// the report — and the tab a visitor needs most.
		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		// Four rooms is the shape from the report: 652 px of grid against 342 px of
		// phone, with two rooms falling off the right-hand side entirely.
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');
		const rooms = ['Main Hall', 'Room 2A', 'Room 2B', 'Workshop Lab'];
		field().clear();
		for (const name of rooms.slice(0, -1)) field().type(`${name}{shift}{enter}`);
		field().type(`${rooms.at(-1)}{enter}`);
		for (const name of rooms) {
			cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`).should('exist');
		}

		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Publish')
			.click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('[data-testid="agenda-room-card"]', 'Main Hall')
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		cy.chooseFromAppSelect('agenda-slot-session', 'Fixture Talk A');
		cy.chooseFromAppSelect('agenda-slot-room', 'Main Hall');
		cy.chooseFromAppSelect('agenda-slot-start', '09:00');
		cy.get('[data-testid="agenda-slot-place"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');

		// A placement is a draft until the organizer publishes the agenda, and a
		// draft is invisible to the public loader. Without this click the public page
		// would render its empty state and the spec would measure nothing.
		cy.contains('button', 'Publish the agenda').click();
		cy.contains('button', 'Unpublish the agenda', { timeout: 20000 }).should('exist');
	});

	/** The element that scrolls is the edge's sibling inside the same box. */
	const viewportOf = (edge: JQuery<HTMLElement>) =>
		edge[0].parentElement!.querySelector('div') as HTMLDivElement;

	/** Two strips live on the agenda page — say which one every assertion means. */
	const GRID = '[data-testid="agenda-room-grid"] [data-testid="scroll-edge"]';
	const TABS = '[data-testid="conference-tabs"] [data-testid="scroll-edge"]';

	it('marks the room grid as cut off at 390 px, and drops the fade at the end of the scroll', () => {
		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		// The sentence names what is missing. A fade is easy to miss; "the other
		// rooms" is not (#403).
		cy.get('[data-testid="scroll-hint"]')
			.should('be.visible')
			.and('contain', 'Scroll sideways for the other rooms');

		cy.get(GRID)
			.should('be.visible')
			.then(($edge) => {
				const viewport = viewportOf($edge);
				// The precondition, asserted rather than assumed: without real overflow
				// a visible edge would be the lie this issue is about.
				expect(viewport.scrollWidth, 'grid content').to.be.greaterThan(viewport.clientWidth);

				// Scrolled to the far right there is nothing left to promise with a
				// fade. The sentence stays: the rooms still do not fit.
				viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
				viewport.dispatchEvent(new Event('scroll'));
			});

		cy.get(GRID).should('not.exist');
		cy.get('[data-testid="scroll-hint"]').should('be.visible');
	});

	it('leaves the desktop agenda alone', () => {
		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		// Four rooms fit in a desktop window, so the edge would be a promise of
		// something that is already on screen. The room grid is the widest thing on
		// the page, so if it fits, nothing here overflows.
		cy.contains('Workshop Lab').should('exist');
		cy.get('[data-testid="scroll-edge"]').should('not.exist'); // neither strip
		cy.get('[data-testid="scroll-hint"]').should('not.exist');
	});

	it('marks the tab strip and still lets the tab under the edge be tapped', () => {
		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/c/${slug}`);
		cy.waitForHydration();

		cy.get(TABS)
			.should('be.visible')
			.then(($edge) => {
				const viewport = viewportOf($edge);
				expect(viewport.scrollWidth, 'tab strip').to.be.greaterThan(viewport.clientWidth);
			});

		// The edge is decoration and has to stay decoration: no clicks, and nothing
		// for a screenreader to announce.
		cy.get(TABS).should('have.attr', 'aria-hidden', 'true');
		cy.get(TABS).should('have.css', 'pointer-events', 'none');

		// The tab furthest right is the one the edge lies over. Reaching it is the
		// whole point of leaving the strip scrollable.
		cy.get('nav[aria-label="Conference sections"] a').last().click();
		cy.location('pathname').should('not.eq', `/c/${slug}`);
	});
});
