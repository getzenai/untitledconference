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
 * placements directly would be testing this file. Empty rooms earn no public
 * column (#561), so each hall in the overflow fixture holds a talk.
 */
const uniqueSlug = () => `scroll-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PHONE = { width: 390, height: 844 };
/**
 * The narrow phone, and the reason there are two (#617). The tab strip used to
 * overflow at 390 px and arrive with "Call for papers" cut to "Cal"; it fits
 * there now. It still does not fit here — 320 px is the old iPhone SE and what a
 * 390 px screen becomes under large browser text — so this is where the strip's
 * own behaviour is measured. The room grid overflows on both.
 */
const NARROW_PHONE = { width: 320, height: 568 };
const DESKTOP = { width: 1280, height: 800 };

const ROOMS = ['Main Hall', 'Room 2A', 'Room 2B', 'Workshop Lab'];
const TALKS = ['Fixture Talk A', 'Fixture Talk B', 'Fixture Talk C', 'Fixture Talk D'];

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
					sessions: TALKS
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

		// Four occupied rooms is the shape from the report: 652 px of grid against
		// 342 px of phone, with two rooms falling off the right-hand side entirely.
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');
		field().clear();
		for (const name of ROOMS.slice(0, -1)) field().type(`${name}{shift}{enter}`);
		field().type(`${ROOMS.at(-1)}{enter}`);
		for (const name of ROOMS) {
			cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`).should('exist');
		}

		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]')
			.should('contain.text', 'Publish')
			.click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		for (const [i, name] of ROOMS.entries()) {
			cy.contains('[data-testid="agenda-room-card"]', name)
				.find('[data-testid^="agenda-open-slot-"]')
				.click();
			cy.get('[data-testid="agenda-slot-editor"]').should('exist');
			cy.chooseFromAppSelect('agenda-slot-session', TALKS[i]);
			cy.chooseFromAppSelect('agenda-slot-room', name);
			cy.chooseFromAppSelect('agenda-slot-start', '09:00');
			cy.get('[data-testid="agenda-slot-place"]').click();
			cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
		}

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

	it('reaches the last room and comes back with nothing but clicks (#589)', () => {
		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		const GRID_BOX = '[data-testid="agenda-room-grid"]';
		const onward = `${GRID_BOX} [data-testid="scroll-on"]`;
		const back = `${GRID_BOX} [data-testid="scroll-back"]`;
		/** How far the grid has actually travelled, retried until the smooth scroll lands. */
		const offset = () => cy.get(`${GRID_BOX} > div`).first().invoke('scrollLeft');

		// Nothing has moved yet, so there is nothing behind us to go back to. A
		// button offering the trip anyway is the same lie as a permanent fade.
		cy.get(back).should('not.exist');

		// A mouse, and only a mouse. Each click moves most of a box; four rooms in
		// 342 px take two or three, so keep clicking while the button is still there.
		//
		// Each step waits for the strip to have moved rather than for a number of
		// milliseconds: `behavior: 'smooth'` has no promised duration, so a fixed
		// wait is either slower than the scroll or — on a loaded CI box — shorter
		// than it, and the second kind of flake only shows up in somebody else's PR.
		const toTheEnd = (left = 6) => {
			if (left === 0) return;
			cy.get('body').then(($body) => {
				if ($body.find(onward).length === 0) return;
				offset().then((before) => {
					cy.get(onward).click();
					offset().should('be.greaterThan', Number(before));
					toTheEnd(left - 1);
				});
			});
		};
		toTheEnd();

		cy.contains(ROOMS.at(-1)!).should('be.visible');
		cy.get(onward).should('not.exist');

		const toTheStart = (left = 6) => {
			if (left === 0) return;
			cy.get('body').then(($body) => {
				if ($body.find(back).length === 0) return;
				offset().then((before) => {
					cy.get(back).click();
					offset().should('be.lessThan', Number(before));
					toTheStart(left - 1);
				});
			});
		};
		toTheStart();

		cy.contains(ROOMS[0]).should('be.visible');
		cy.get(back).should('not.exist');
	});

	it('gives the two strips on one screen two different button names (#604)', () => {
		cy.viewport(NARROW_PHONE.width, NARROW_PHONE.height);
		cy.visit(`/c/${slug}/agenda`);
		cy.waitForHydration();

		// The agenda is the page where both strips overflow at once. The eye tells
		// them apart by where they sit; a screenreader has only the name, and two
		// buttons called "Scroll right" leave it with no way to say which.
		cy.get('[data-testid="conference-tabs"] [data-testid="scroll-on"]').should(
			'have.attr',
			'aria-label',
			'Scroll sections right'
		);
		cy.get('[data-testid="agenda-room-grid"] [data-testid="scroll-on"]').should(
			'have.attr',
			'aria-label',
			'Scroll rooms right'
		);

		// The back button carries the same name, so the pair stays consistent once
		// the reader has moved either strip.
		cy.get('[data-testid="agenda-room-grid"] [data-testid="scroll-on"]').click();
		cy.get('[data-testid="agenda-room-grid"] [data-testid="scroll-back"]').should(
			'have.attr',
			'aria-label',
			'Scroll rooms left'
		);
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
		cy.get('[data-testid="scroll-on"]').should('not.exist');
		cy.get('[data-testid="scroll-back"]').should('not.exist');
	});

	it('fits every tab on a 390 px phone, whole words (#617)', () => {
		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/c/${slug}`);
		cy.waitForHydration();

		// The bug was a tab arriving as "Cal". The fix is not a wider strip but a
		// shorter label, so the assertion is the strip fitting: nothing sticks out,
		// therefore nothing is cut, therefore every label on screen is whole.
		cy.get('[data-testid="conference-tabs"] > div')
			.first()
			.then(($viewport) => {
				const viewport = $viewport[0];
				expect(viewport.scrollWidth, 'tab strip at 390 px').to.be.at.most(viewport.clientWidth + 1);
			});

		// Nothing sticking out means nothing to promise: no fade, no button.
		cy.get(TABS).should('not.exist');
		cy.get('[data-testid="conference-tabs"] [data-testid="scroll-on"]').should('not.exist');

		// The eye reads three letters; a screenreader still hears the whole name,
		// and the link still goes where the long name says it does.
		cy.contains('nav[aria-label="Conference sections"] a', 'CFP')
			.should('be.visible')
			.and('have.attr', 'href', `/c/${slug}/cfp`);
		cy.get('nav[aria-label="Conference sections"]').should('contain.text', 'Call for papers');
	});

	it('marks the tab strip and still lets the tab under the edge be tapped', () => {
		cy.viewport(NARROW_PHONE.width, NARROW_PHONE.height);
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

		// The button, on the other hand, lies over a half-cut tab on purpose, and a
		// click on it has to move the strip rather than open whatever is underneath
		// (#589). Staying on the page is the assertion.
		cy.get('[data-testid="conference-tabs"] [data-testid="scroll-on"]').click();
		// The back button only appears once the strip has really moved, so waiting
		// for it is waiting for the scroll — no clock involved.
		cy.get('[data-testid="conference-tabs"] [data-testid="scroll-back"]').should('exist');
		cy.location('pathname').should('eq', `/c/${slug}`);

		// The tab furthest right is the one the edge lies over. Reaching it is the
		// whole point of leaving the strip scrollable.
		cy.get('nav[aria-label="Conference sections"] a').last().click();
		cy.location('pathname').should('not.eq', `/c/${slug}`);
	});
});
