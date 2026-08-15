/**
 * Dragging on the agenda grid (#121).
 *
 * The arithmetic behind a drop is a unit test in `agenda-grid.unit.test.ts`. What
 * cannot be proved there is the part this spec exists for: that a real gesture in
 * a real browser reaches that arithmetic and comes out the other side as a row in
 * the database. A pure function that is never wired to a pointer is a function
 * that passes its tests and moves nothing.
 *
 * The gesture is driven as three pointer events with real coordinates, taken from
 * the target cell's own rectangle rather than from a guess: the page must agree
 * with the browser about where a slot is, and hard-coded pixels would only prove
 * that the test and the layout were written by the same hand.
 *
 * `pointerdown` goes to the block; move and release go to the window, which is
 * where the page listens. Doing it any other way would test a wiring the product
 * does not have.
 */
const uniqueSlug = () => `agenda-drag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Agenda drag and drop', () => {
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
					sessions: ['Fixture Talk A', 'Fixture Talk B']
				}
			})
				.its('status')
				.should('eq', 200);
		});
	});

	/** Rooms come from the product's own settings form, as in the slot-editor spec. */
	const addRooms = (names: string[]) => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();

		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');
		field().clear();
		for (const name of names.slice(0, -1)) field().type(`${name}{shift}{enter}`);
		field().type(`${names.at(-1)}{enter}`);

		for (const name of names) {
			cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`).should('exist');
		}

		cy.visit(`/manage/${slug}/agenda`);
		// The whole feature is a JavaScript one: without hydration there is nothing
		// listening for a pointer, and the drag would fail for a reason that has
		// nothing to do with the drag.
		cy.waitForHydration();
	};

	/**
	 * Drag the source onto a room's slot.
	 *
	 * `named` picks the matching element by its visible text — the tray lists more
	 * than one talk, and `.first()` is whichever row the unordered insert happened
	 * to give the lowest id. Two moves rather than one: the first crosses the
	 * threshold that separates a drag from a click, the second lands.
	 */
	const dragOnto = (source: string, room: string, startMinutes: number, named?: string) => {
		cy.contains('[data-testid="agenda-room-card"]', room)
			.invoke('attr', 'data-room-id')
			.then((roomId) => {
				const cell = `[data-testid="agenda-slot-cell"][data-room-id="${roomId}"][data-start-minutes="${startMinutes}"]`;

				// Press first, measure second. `.trigger()` scrolls its subject into
				// view before firing, and the page reads the columns' rectangle live —
				// so a target measured before the press would be a viewport
				// coordinate from a page that has since moved under it. The drop then
				// lands a few rows off, which is the shape of a bug that looks like
				// "drag is broken" and is really "the test measured too early".
				const grip = named ? cy.contains(source, named) : cy.get(source).first();
				grip.trigger('pointerdown', {
					eventConstructor: 'PointerEvent',
					button: 0,
					pointerId: 1,
					pointerType: 'mouse',
					clientX: 0,
					clientY: 0
				});

				cy.get(cell).then(($cell) => {
					const box = $cell[0].getBoundingClientRect();
					const to = { x: box.left + box.width / 2, y: box.top + box.height / 2 };

					// Two moves: the first crosses the threshold that separates a drag
					// from a click, the second lands.
					for (const at of [{ x: 40, y: 40 }, to]) {
						cy.window().trigger('pointermove', {
							eventConstructor: 'PointerEvent',
							pointerId: 1,
							pointerType: 'mouse',
							clientX: at.x,
							clientY: at.y
						});
					}

					cy.window().trigger('pointerup', {
						eventConstructor: 'PointerEvent',
						pointerId: 1,
						pointerType: 'mouse',
						clientX: to.x,
						clientY: to.y
					});
				});
			});
	};

	/** The column headed by this room — not a card whose alternative label mentions it. */
	const roomCard = (name: string) =>
		cy
			.contains('[data-testid="agenda-room-name"]', name)
			.closest('[data-testid="agenda-room-card"]');

	/** Put a tray talk on the grid through the editor, so the drag tests start placed. */
	const placeFromTray = (title: string, room: string, start: string) => {
		cy.contains('[data-testid="agenda-room-card"]', room)
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		cy.chooseFromAppSelect('agenda-slot-session', title);
		cy.chooseFromAppSelect('agenda-slot-room', room);
		cy.chooseFromAppSelect('agenda-slot-start', start);
		cy.get('[data-testid="agenda-slot-place"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	};

	it('keeps a draft talk in both rooms when dragged to a second slot', () => {
		addRooms(['Hall 1', 'Hall 2']);
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');

		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '09:00');

		dragOnto('[data-testid^="agenda-edit-slot-"]', 'Hall 2', 11 * 60);

		roomCard('Hall 2')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '11:00');
		// The first slot stays. A move that erases it is the failure this pins (#559).
		roomCard('Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '09:00');
		cy.get('[data-testid="agenda-alternative"]').should('exist');
	});

	it('takes a talk out of the tray onto the slot it is dropped on', () => {
		addRooms(['Hall 1']);

		cy.contains('[data-testid="agenda-tray-item"]', 'Fixture Talk A').should('exist');

		dragOnto('[data-testid="agenda-tray-item"]', 'Hall 1', 14 * 60 + 30, 'Fixture Talk A');

		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '14:30');
		// The tray is where it came from; leaving a copy behind is the other half
		// of the same failure.
		cy.contains('[data-testid="agenda-tray-item"]', 'Fixture Talk A').should('not.exist');
	});

	/**
	 * Dropping a draft onto a draft slot keeps both as alternatives (#559).
	 */
	it('keeps both drafts when one is dropped onto the other', () => {
		addRooms(['Hall 1', 'Hall 2']);
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');
		placeFromTray('Fixture Talk B', 'Hall 2', '10:00');

		cy.get('[data-testid="agenda-placed-session"]').should('have.length', 2);

		dragOnto('[data-testid="agenda-placed-session"]', 'Hall 2', 10 * 60, 'Fixture Talk A');

		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
		roomCard('Hall 2').find('[data-testid="agenda-placed-session"]').should('have.length', 2);
		roomCard('Hall 2').should('contain', 'Fixture Talk A').and('contain', 'Fixture Talk B');
		roomCard('Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('exist');
		cy.get('[data-testid="agenda-alternative"]').should('exist');
	});

	/**
	 * A click is not a drag. The block is the button that opens its own slot, so a
	 * press that never moves has to reach the editor — otherwise the threshold that
	 * makes dragging possible would have eaten the click path the eval harness and
	 * the keyboard both use.
	 */
	it('still opens the editor when a block is clicked rather than dragged', () => {
		addRooms(['Hall 1']);
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');

		cy.get('[data-testid^="agenda-edit-slot-"]').first().click();

		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		cy.get('[data-testid="agenda-slot-editor"]').should('contain', 'Fixture Talk A');
	});
});
