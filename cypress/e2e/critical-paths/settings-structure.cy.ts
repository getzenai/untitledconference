/**
 * Editing and removing rooms, tracks and formats (#119).
 *
 * The list on the settings page could only grow. A typo was permanent, and so
 * was a room the venue took back — which is what Fabian hit walking the product
 * on 2026-08-11.
 *
 * The integration tests next to `config.ts` prove the writers refuse a removal
 * while something still points at the row. What they cannot prove is that an
 * organizer can reach any of it: the rename and the Remove are separate forms in
 * the same list row, and a browser is the only place that arrangement is real.
 *
 * The last test is the one worth the wall-clock. It schedules a session into a
 * room through the agenda and then tries to remove that room from settings. All
 * three foreign keys here are `on delete set null`, so a missing guard does not
 * throw — it answers "Room removed." and leaves the session scheduled nowhere.
 * A green run with no such test would say the feature works.
 */
const uniqueSlug = () => `structure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Editing conference structure', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			// Days and accepted submissions only — the fixture creates no rooms, and
			// rooms are the subject here.
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: ['Fixture Talk A'] }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	const openSettings = () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
	};

	/** One submit for the whole list (#110): shift+enter between lines, enter to send. */
	const addRooms = (names: string[]) => {
		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');

		field().clear();
		for (const name of names.slice(0, -1)) field().type(`${name}{shift}{enter}`);
		field().type(`${names.at(-1)}{enter}`);

		cy.get('[data-testid="settings-room-row"]').should('have.length', names.length);
	};

	/**
	 * The row for a room, found by the name the page last rendered for it.
	 *
	 * `data-name` rather than the field's `value`: the input's value is a property
	 * after hydration, not an attribute, so a CSS attribute selector on it stops
	 * matching the moment `use:enhance` re-renders the list.
	 */
	const roomRow = (name: string) =>
		cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`);

	it('renames a room and removes one that is not in use', () => {
		openSettings();
		addRooms(['Hall 1', 'Staging']);

		roomRow('Hall 1').within(() => {
			cy.get('input[name="name"]').clear().type('Hall One');
			cy.contains('button', 'Save').click();
		});
		cy.get('[data-testid="settings-rooms"] [data-testid="settings-message"]').should(
			'contain.text',
			'Room renamed'
		);
		roomRow('Hall One').should('exist');

		// A second room may not take the first one's name, whatever the case — two
		// rooms of one name are indistinguishable on the agenda grid.
		roomRow('Staging').within(() => {
			cy.get('input[name="name"]').clear().type('hall one');
			cy.contains('button', 'Save').click();
		});
		cy.get('[data-testid="settings-rooms"] [data-testid="settings-error"]').should(
			'contain.text',
			'already'
		);
		cy.get('[data-testid="settings-room-row"]').should('have.length', 2);

		// Nothing is scheduled anywhere yet, so this one really goes.
		cy.reload();
		cy.waitForHydration();
		roomRow('Staging').within(() => {
			cy.get('button[aria-label="Remove room"]').click();
		});
		cy.get('[data-testid="settings-room-row"]').should('have.length', 1);
		roomRow('Hall One').should('exist');
	});

	it('refuses to remove a room that still holds a session, and names the count', () => {
		openSettings();
		addRooms(['Hall 1', 'Staging']);

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();

		// Open the empty staging room's slot and send the tray talk to Hall 1 — the
		// way the editor is meant to be driven (see agenda-slot-editor.cy.ts).
		cy.contains('[data-testid="agenda-room-card"]', 'Staging')
			.find('[data-testid^="agenda-open-slot-"]')
			.click();
		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		cy.contains('[data-testid="agenda-slot-session"] option', 'Fixture Talk A')
			.should('exist')
			.then(($option) => {
				cy.get('[data-testid="agenda-slot-session"]').select(String($option.val()));
			});
		cy.get('[data-testid="agenda-slot-editor"] select[name="roomId"]').select('Hall 1');
		cy.get('[data-testid="agenda-slot-editor"] select[name="startMinutes"]').select('09:00');
		cy.get('[data-testid="agenda-slot-place"]').click();
		cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');

		// Precondition: a refusal test that passes because nothing was scheduled is
		// the same mistake in a different costume.
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.find('[data-testid="agenda-placed-session"]')
			.should('have.length', 1);

		openSettings();
		roomRow('Hall 1').within(() => {
			cy.get('button[aria-label="Remove room"]').click();
		});

		cy.get('[data-testid="settings-rooms"] [data-testid="settings-error"]').should(
			'contain.text',
			'1 session'
		);
		roomRow('Hall 1').should('exist');

		// And the session is still where it was put. The failure this test exists
		// for does not throw — it silently clears the room off the grid.
		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.contains('[data-testid="agenda-room-card"]', 'Hall 1')
			.find('[data-testid="agenda-placed-session"]')
			.should('have.length', 1);
	});
});
