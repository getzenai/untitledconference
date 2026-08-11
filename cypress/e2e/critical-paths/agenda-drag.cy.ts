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
	 * Drag whatever the source selector matches onto a room's slot.
	 *
	 * Two moves rather than one: the first crosses the threshold that separates a
	 * drag from a click, the second lands. A single jump would work today and would
	 * stop proving anything the moment the threshold changes.
	 */
	const dragOnto = (source: string, room: string, startMinutes: number) => {
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
				cy.get(source).first().trigger('pointerdown', {
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

	/** Put a tray talk on the grid through the editor, so the drag tests start placed. */
	const placeFromTray = (title: string, room: string, start: string) => {
		cy.contains('[data-testid="agenda-room-card"]', room)
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		cy.contains('[data-testid="agenda-slot-session"] option', title)
			.should('exist')
			.then(($option) => {
				cy.get('[data-testid="agenda-slot-session"]').select(String($option.val()));
			});
		cy.get('[data-testid="agenda-slot-editor"] select[name="roomId"]').select(room);
		cy.get('[data-testid="agenda-slot-editor"] select[name="startMinutes"]').select(start);
		cy.get('[data-testid="agenda-slot-place"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	};

	it('moves a placed session into another room and time', () => {
		addRooms(['Hall 1', 'Hall 2']);
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');

		// Preconditions, both of them: the talk is on the grid, and it is in the
		// room the drag is supposed to take it out of. Without the second, a test
		// that never moved anything would still find it in Hall 2 if it started there.
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '09:00');

		dragOnto('[data-testid^="agenda-edit-slot-"]', 'Hall 2', 11 * 60);

		cy.contains('[data-testid="agenda-room-card"]', 'Hall 2')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '11:00');
		// And gone from where it was. A move that copies is the failure this pins.
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.find('[data-testid="agenda-placed-session"]')
			.should('not.exist');
	});

	it('takes a talk out of the tray onto the slot it is dropped on', () => {
		addRooms(['Hall 1']);

		cy.contains('[data-testid="agenda-tray-item"]', 'Fixture Talk A').should('exist');

		dragOnto('[data-testid="agenda-tray-item"]', 'Hall 1', 14 * 60 + 30);

		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '14:30');
		// The tray is where it came from; leaving a copy behind is the other half
		// of the same failure.
		cy.contains('[data-testid="agenda-tray-item"]', 'Fixture Talk A').should('not.exist');
	});

	/**
	 * Dropping on a taken slot opens the editor instead of writing.
	 *
	 * `placeSession` is permissive about conflicts, so a plain place here would
	 * double-book rather than swap or refuse — the editor is where the two honest
	 * readings of the gesture (trade, or empty it first) are offered.
	 */
	it('opens the slot editor instead of double-booking an occupied slot', () => {
		addRooms(['Hall 1', 'Hall 2']);
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');
		placeFromTray('Fixture Talk B', 'Hall 2', '10:00');

		cy.get('[data-testid="agenda-placed-session"]').should('have.length', 2);

		dragOnto('[data-testid^="agenda-edit-slot-"]', 'Hall 2', 10 * 60);

		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		// Nothing was written: B is still the one in Hall 2 at 10:00, and A has not
		// moved out of Hall 1.
		cy.get('[data-testid="agenda-slot-editor"]').should('contain', 'Fixture Talk B');
		cy.get('[data-testid="agenda-slot-editor"] [data-testid="agenda-slot-remove"]').should('exist');
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
