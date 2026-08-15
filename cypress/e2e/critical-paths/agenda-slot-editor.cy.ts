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
		//
		// By `data-name` rather than by text: since #119 a room's name lives in the
		// editable field of its row, and a field's value is not text a browser can
		// be asked to find.
		for (const name of names) {
			cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`).should('exist');
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
		// before asking what the editor offers. The filter is a shadcn popover
		// (multi-select, #265), not a native <select>, so drive it the way a user
		// would: open it, tick the room's checkbox, dismiss it.
		cy.get('[data-testid="agenda-room-filter"]').click();
		cy.get('[data-slot="popover-content"]').contains('Hall 1').click();
		cy.get('body').type('{esc}');
		cy.get('[data-testid="agenda-room-card"]').should('have.length', 1);

		cy.get('[data-testid^="agenda-open-slot-"]').first().click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		// The point of the whole spec: the grid shows one room, the editor offers
		// all six. A view filter must not make a destination unreachable.
		//
		// Since #167 the room control is an app select, so the list only exists
		// once the listbox is open — which is also the only state in which the
		// claim means anything to an organizer.
		cy.get('[data-testid="agenda-slot-room"]').scrollIntoView().click();
		cy.get('[role="listbox"]:visible').within(() => {
			cy.get('[role="option"]').should('have.length', ROOM_FILTER_FROM);
			for (const name of names) cy.contains('[role="option"]', name).should('exist');
		});
		// Escape closes the list, not the dialog behind it. The native <select>
		// swallowed the key; an app select only marks it handled, and the agenda's
		// own window handler used to close the whole editor on top of it — an
		// organizer dismissing the room list would have lost their unsaved slot.
		cy.get('body').type('{esc}');
		cy.get('[role="listbox"]').should('not.exist');
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');

		// And with the list closed, Escape still means "close the editor".
		cy.get('body').type('{esc}');
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	});

	it('narrows the grid to several rooms at once via the multi-select', () => {
		const names = Array.from({ length: ROOM_FILTER_FROM }, (_, i) => `Hall ${i + 1}`);

		addRooms(names);

		// The whole reason Fabian asked for the dropdown (see #265): more than one
		// room can be shown at once. The native <select> could only ever narrow to
		// one, so the multi-select is the new capability and it is what this test
		// is here to pin down.
		cy.get('[data-testid="agenda-room-filter"]').should('exist');

		for (const name of ['Hall 1', 'Hall 2']) {
			cy.get('[data-testid="agenda-room-filter"]').click();
			cy.get('[data-slot="popover-content"]').contains(name).click();
			cy.get('body').type('{esc}');
		}

		// The trigger states what is shown, and the grid actually shows it: two
		// columns, both of the rooms that were picked. The length assertion alone
		// would pass if two *other* cards happened to be there, so name both.
		cy.get('[data-testid="agenda-room-filter"]').should('contain.text', '2 of 6 rooms');
		cy.get('[data-testid="agenda-room-card"]').should('have.length', 2);
		const shown: string[] = [];
		cy.get('[data-testid="agenda-room-card"]').each(($card) => {
			shown.push($card.find('[data-testid="agenda-room-name"]').text().trim());
		});
		cy.wrap(shown).should('include', 'Hall 1');
		cy.wrap(shown).should('include', 'Hall 2');
	});

	it('reports two drafts in one slot as alternatives, not a clash', () => {
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

		// Draft × draft is an alternative (#559). A published overlap is the clash.
		cy.contains('[data-testid="agenda-alternative"]', 'Two draft options in Hall 1 at').should(
			'exist'
		);
		cy.get('[data-testid="agenda-conflict"]').should('not.exist');

		// And both of them are on screen, next to each other (#121). On a calendar
		// two overlapping blocks occupy the same rows, so drawn full width the second
		// would sit exactly on top of the first — a double-booking that reads as one
		// talk on the very screen whose job is to show the overlap. Compared by
		// position rather than by class, because what has to be true is that a human
		// can see two blocks.
		cy.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk A')
			.should('be.visible')
			.then(($a) => {
				const a = $a[0].getBoundingClientRect();
				cy.contains('[data-testid="agenda-placed-session"]', 'Fixture Talk B')
					.should('be.visible')
					.then(($b) => {
						const b = $b[0].getBoundingClientRect();
						expect(a.right).to.be.at.most(b.left + 1);
					});
			});
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
		// session on this day, and not the one already in the slot. Since #167 that
		// list only exists while the listbox is open, so the check opens it —
		// closing again afterwards, because the portalled listbox would otherwise
		// sit over the button the next line clicks. Closed by toggling the trigger,
		// not by Escape: Escape reaches the dialog behind it and shuts the whole
		// slot editor.
		cy.get('[data-testid="agenda-slot-swap-with"]').scrollIntoView().click();
		cy.get('[role="listbox"]:visible').within(() => {
			cy.get('[role="option"]').should('have.length', 1);
			cy.get('[role="option"]').should('contain', 'Fixture Talk B').and('contain', 'Hall 2');
		});
		cy.get('[data-testid="agenda-slot-swap-with"]').click();
		cy.get('[role="listbox"]').should('not.exist');

		// Submitted without touching the control: the seeded value is what the
		// native element used to post on its own, and losing it would make this
		// button a no-op.
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

		// The option reads "Fixture Talk A (30 min)", so an exact-text match would
		// pin the session length as well as the title. `cy.contains` matches on a
		// substring, which is the looser claim this wants.
		cy.chooseFromAppSelect('agenda-slot-session', title);
		cy.chooseFromAppSelect('agenda-slot-room', room);
		cy.chooseFromAppSelect('agenda-slot-start', start);
		cy.get('[data-testid="agenda-slot-place"]').click();

		// The dialog closes on a successful write; waiting for that keeps the next
		// step from typing into a form that is about to be replaced.
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');
	}
});
