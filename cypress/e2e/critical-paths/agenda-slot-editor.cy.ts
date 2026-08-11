/**
 * The agenda slot editor, driven the way an agent drives it.
 *
 * Two things live here that no unit test can reach:
 *
 *  1. **The page hands the editor every room, not the filtered ones.** The room
 *     filter only appears from six rooms up, so this spec creates six itself —
 *     through the UI, not through the fixture. `slot-editor.unit.test.ts` proves
 *     the component renders whatever list it is given; only a real page with a
 *     real filter set can prove which list that is.
 *  2. **A clash is still reachable through the editor** (AIA-05). Placing two
 *     talks so they overlap in one room has to produce a visible warning rather
 *     than a refusal — `placeSession` is permissive on purpose.
 *
 * Every check that could pass for the wrong reason is preceded by an assertion
 * that its precondition actually holds: that the filter element exists, that a
 * room is really selected, that both sessions really landed on the grid. A green
 * run that skipped the setup would otherwise read as a green feature.
 */
const ROOM_FILTER_FROM = 6;

const uniqueSlug = () => `agenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Agenda slot editor', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			// Days and accepted submissions only. Rooms are the subject of test 1,
			// so they must not come from here.
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

	/**
	 * Rooms are created on the settings page — #87 moved structure config off the
	 * agenda, so this is the only place a real organizer can add one. Still the
	 * product's own form, which is the part that matters: the room list this spec
	 * checks must come from real data, not from the fixture.
	 */
	const addRooms = (names: string[]) => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();

		// One submit for the whole list (#110). Shift+enter between the lines, plain
		// enter to send — which is also the only place that keyboard handling is
		// exercised in a real browser, so a broken one fails here rather than
		// quietly in front of an organizer.
		//
		// One `.type()` per line on purpose: Cypress holds a modifier until the end
		// of the command it appears in, so a single `{shift}{enter}`-joined string
		// would leave shift down for the final enter and write a newline instead of
		// submitting.
		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');

		field().clear();
		for (const name of names.slice(0, -1)) field().type(`${name}{shift}{enter}`);
		field().type(`${names.at(-1)}{enter}`);

		// Every room listed before we leave, or the agenda below is checking a page
		// that is still being written.
		for (const name of names) {
			cy.contains('[data-testid="settings-rooms"] li', name).should('exist');
		}

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
	};

	it('offers every room in the slot editor while the room filter is narrowing the grid', () => {
		const names = Array.from({ length: ROOM_FILTER_FROM }, (_, i) => `Hall ${i + 1}`);

		addRooms(names);

		// Precondition, not decoration: below six rooms this element does not exist
		// and the rest of the test would be checking an unfiltered page while
		// claiming to check a filtered one.
		cy.get('[data-testid="agenda-room-filter"]').should('exist');

		// Narrow the grid to a single room, and prove the narrowing took effect
		// before asking what the editor offers.
		cy.get('[data-testid="agenda-room-filter"]').select('Hall 1');
		cy.get('[data-testid="agenda-room-card"]').should('have.length', 1);

		cy.get('[data-testid^="agenda-open-slot-"]').first().click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		// The point of the whole spec: the grid shows one room, the editor offers
		// all six. A view filter must not make a destination unreachable.
		cy.get('[data-testid="agenda-slot-editor"] select[name="roomId"] option').should(
			'have.length',
			ROOM_FILTER_FROM
		);
		cy.get('[data-testid="agenda-slot-editor"] select[name="roomId"]').within(() => {
			for (const name of names) cy.contains('option', name).should('exist');
		});
	});

	it('reports a clash when two talks overlap in one room', () => {
		// Two rooms, and the second one is scaffolding rather than subject. A room
		// card's "Open a slot" always opens that room's first slot, and once
		// something sits there the dialog switches to its occupied shape — it
		// offers to empty the slot, not to fill it. Opening the *empty* room and
		// redirecting the placement is how the editor is meant to be driven, and
		// it is the only route to a second talk in an already-taken slot.
		addRooms(['Hall 1', 'Staging']);

		// Both talks into Hall 1, the second starting inside the first. 30 minutes
		// is the default length, so 09:00 and 09:15 overlap.
		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');
		placeFromTray('Fixture Talk B', 'Hall 1', '09:15');

		// Precondition: a clash test that passes because nothing got placed is the
		// same mistake in a different costume.
		cy.get('[data-testid="agenda-placed-session"]').should('have.length', 2);

		// The wording `agenda.ts` produces for a room clash, named rather than
		// pattern-matched: a loose regex would also pass on some unrelated warning
		// that happened to say "conflict". The minute is left out on purpose —
		// `roomConflicts` reports the start of whichever placement has the lower
		// id, which is an ordering detail this test has no business pinning.
		cy.contains('[data-testid="agenda-conflict"]', 'Two sessions in Hall 1 at').should('exist');
	});

	it('swaps two placed talks in one action, and offers only the rest of the day', () => {
		addRooms(['Hall 1', 'Hall 2', 'Staging']);

		placeFromTray('Fixture Talk A', 'Hall 1', '09:00');
		placeFromTray('Fixture Talk B', 'Hall 2', '10:00');

		// Precondition: a swap test that passes because nothing was on the grid
		// would be asserting an empty dropdown against an empty expectation.
		cy.get('[data-testid="agenda-placed-session"]').should('have.length', 2);

		cy.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.find('[data-testid^="agenda-edit-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		// The list the *page* builds, which the component test cannot see: the other
		// session on this day, and not the one already in the slot.
		cy.get('[data-testid="agenda-slot-swap-with"] option').should('have.length', 1);
		cy.get('[data-testid="agenda-slot-swap-with"] option')
			.should('contain', 'Fixture Talk B')
			.and('contain', 'Hall 2');

		cy.get('[data-testid="agenda-slot-swap"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');

		// Both moved, in one post. Two sessions on the grid still, neither in the
		// tray — the failure this whole issue is about is one of them going missing.
		cy.get('[data-testid="agenda-placed-session"]').should('have.length', 2);
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 2')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('contain', '10:00');
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk B')
			.should('contain', '09:00');
	});

	/** Open the empty staging room's slot and send a tray talk somewhere else. */
	function placeFromTray(title: string, room: string, start: string) {
		cy.contains('[data-testid="agenda-room-card"]', 'Staging')
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		// The option reads "Fixture Talk A (30 min)", so an exact-text select would
		// pin the session length as well as the title. Match the option on its
		// title and submit its value instead.
		cy.contains('[data-testid="agenda-slot-session"] option', title)
			.should('exist')
			.then(($option) => {
				cy.get('[data-testid="agenda-slot-session"]').select(String($option.val()));
			});
		cy.get('[data-testid="agenda-slot-editor"] select[name="roomId"]').select(room);
		cy.get('[data-testid="agenda-slot-editor"] select[name="startMinutes"]').select(start);
		cy.get('[data-testid="agenda-slot-place"]').click();

		// The dialog closes on a successful write; waiting for that keeps the next
		// step from typing into a form that is about to be replaced.
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	}
});
