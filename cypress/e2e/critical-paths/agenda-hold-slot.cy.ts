/**
 * #450: a sponsor slot exists on the grid, and the committee is told about it.
 *
 * `createBlock` has been in the server module since the agenda shipped, reachable
 * only by the in-app agent — so an organizer who had sold eleven sponsor slots had
 * no way to put them anywhere, and the acceptance call counted against a programme
 * that pretended those slots were free.
 *
 * The two ends are what a browser can prove and nothing else can: the hold survives
 * a reload (it reached the database, not just the DOM), and the number the decision
 * room prints comes from that same row on a different screen.
 */
const uniqueSlug = () => `hold450-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('An organizer holds a slot for a sponsor', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['A talk that was accepted'],
					sessionStatus: 'accepted'
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
	});

	it('puts the hold on the grid, tells the decision room, and gives the slot back', () => {
		cy.get('[data-testid="agenda-hold-open"]').click();
		cy.get('[data-testid="agenda-hold-kind-reservation"]').check();
		cy.get('[data-testid="agenda-hold-title"]').type('Gold sponsor slot');
		cy.get('[data-testid="agenda-hold-submit"]').click();

		cy.get('[data-testid="agenda-hold"][data-kind="reservation"]').should(
			'contain',
			'Gold sponsor slot'
		);

		// It reached the database, not just the page.
		cy.reload();
		cy.get('[data-testid="agenda-hold"][data-kind="reservation"]')
			.should('have.length', 1)
			.and('contain', 'sponsor hold');

		// The number the room argues next to. Stated, never subtracted: the
		// remainder is what the organizer typed minus what they accepted.
		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();
		cy.get('[data-testid="slot-sponsor-holds"]').should('contain', '1 sponsor');

		// The backfill: the sponsor never sold it, so the programme gets it back.
		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();
		cy.get('[data-testid="agenda-hold"] button').contains('Release').click();
		cy.get('[data-testid="agenda-hold"]').should('not.exist');

		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();
		cy.get('[data-testid="slot-sponsor-holds"]').should('not.exist');
	});

	/**
	 * A hold that names a room sits in the room grid, and there it looks exactly
	 * like a talk — same card, same click. The three session moves would each read
	 * its length off a format it does not have, so a two-hour sponsor slot would
	 * come back thirty minutes long, and "take it out of this slot" would park it
	 * where only talks are listed: gone from the screen, still counted by the
	 * decision room. The editor offers one move for it, and that move is release.
	 */
	it('offers a room-bound hold a release, not a swap or a removal', () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-rooms"] textarea[name="names"]').clear().type('Hall 1{enter}');
		cy.get('[data-testid="settings-room-row"][data-name="Hall 1"]').should('exist');

		cy.visit(`/manage/${slug}/agenda`);
		cy.waitForHydration();

		cy.get('[data-testid="agenda-hold-open"]').click();
		cy.get('[data-testid="agenda-hold-kind-reservation"]').check();
		cy.get('[data-testid="agenda-hold-title"]').type('Gold sponsor slot');
		cy.chooseFromAppSelect('agenda-hold-room', 'Hall 1');
		cy.chooseFromAppSelect('agenda-hold-minutes', '120 min');
		cy.get('[data-testid="agenda-hold-submit"]').click();

		cy.get('[data-testid="agenda-hold"][data-kind="reservation"]').should(
			'contain',
			'Gold sponsor slot'
		);

		cy.reload();
		cy.waitForHydration();

		// It is a card on the room grid — that part is right, a sold slot has to
		// occupy the column it takes.
		cy.contains('[data-testid="agenda-session-title"]', 'Gold sponsor slot')
			.parents('button')
			.click();

		cy.get('[data-testid="agenda-slot-editor"]').should('exist');
		cy.get('[data-testid="agenda-slot-swap"]').should('not.exist');
		cy.get('[data-testid="agenda-slot-remove"]').should('not.exist');
		cy.get('[data-testid="agenda-slot-status"]').should('not.exist');

		cy.get('[data-testid="agenda-slot-release"]').click();

		cy.get('[data-testid="agenda-hold"]').should('not.exist');
		cy.contains('[data-testid="agenda-session-title"]', 'Gold sponsor slot').should('not.exist');

		// Released means released — the slot is back with the programme, and the
		// decision room stops naming it.
		cy.visit(`/manage/${slug}/decisions`);
		cy.waitForHydration();
		cy.get('[data-testid="slot-sponsor-holds"]').should('not.exist');
	});
});
