/**
 * #889: at 1280 the star sits on the right, where the reserved column
 * does not apply. The last room's slot buttons run to the viewport
 * edge, and one of them had the star at its own centre.
 *
 * The centre is the finding, not a shared rectangle: overlapping
 * 44 px on the right is lost edge, a centre that returns
 * `assistant-open` is a button you cannot press. 390 stays put —
 * the left column there is a different rule and this page is not
 * on it.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `ag889-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Enough rooms that a column stays at `min-w-52` and the last one
 *  reaches the right edge — two wide rooms put their centre miles
 *  left of the star and the miss would go green (#729). */
const ROOMS = ['Hall 1', 'Hall 2', 'Hall 3', 'Hall 4', 'Hall 5', 'Hall 6', 'Hall 7', 'Hall 8'];

function openAgendaWithRooms() {
	const slug = uniqueSlug();

	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: ['A talk waiting for a slot']
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/settings`);
	cy.waitForHydration();

	const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');
	field().clear();
	for (const name of ROOMS.slice(0, -1)) field().type(`${name}{shift}{enter}`);
	field().type(`${ROOMS.at(-1)}{enter}`);
	for (const name of ROOMS) {
		cy.get(`[data-testid="settings-room-row"][data-name="${name}"]`).should('exist');
	}

	cy.visit(`/manage/${slug}/agenda`);
	cy.waitForHydration();
	cy.get('[data-testid="agenda-slot-cell"]').should('exist');
}

describe('The assistant and an agenda slot at 1280', () => {
	it("leaves the last room's slot centre as the slot, and keeps 390 as it is", function () {
		if (!chatEnabled) this.skip();

		openAgendaWithRooms();

		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.get('[data-testid="assistant-open"]').should('be.visible');
		cy.get('[data-testid="agenda-grid-scroll"]').then(($scroll) => {
			const el = $scroll[0];
			el.scrollLeft = el.scrollWidth;
		});

		cy.get('[data-testid="assistant-open"]').then(($star) => {
			const star0 = $star[0].getBoundingClientRect();
			const lastRoom = `[data-testid="agenda-room-card"][data-room-id]`;
			cy.get(lastRoom)
				.last()
				.find('[data-testid="agenda-slot-cell"]')
				.then(($cells) => {
					const win = $cells[0].ownerDocument.defaultView;
					expect(win, 'the page has a window to scroll').to.not.equal(null);
					const mid = $cells[Math.floor($cells.length / 2)][0] ?? $cells[0];
					const cell0 = mid.getBoundingClientRect();
					const delta = star0.top + star0.height / 2 - (cell0.top + cell0.height / 2);
					win!.scrollBy(0, delta);
				});
		});

		cy.get('[data-testid="assistant-open"]').then(($star) => {
			const star = $star[0].getBoundingClientRect();
			expect(star.width, 'star size at 1280').to.be.closeTo(44, 1);
			expect(star.right, 'star on the right edge at 1280').to.be.closeTo(
				$star[0].ownerDocument.documentElement.clientWidth,
				1
			);

			cy.get('[data-testid="agenda-room-card"]')
				.last()
				.find('[data-testid="agenda-slot-cell"]')
				.should(($cells) => {
					const inBand = [...$cells].filter((cell) => {
						const box = cell.getBoundingClientRect();
						return box.top < star.bottom && box.bottom > star.top;
					});
					expect(
						inBand.length,
						'a last-room slot reaches the star band so a miss would show'
					).to.be.greaterThan(0);

					const hit = inBand.find((cell) => {
						const box = cell.getBoundingClientRect();
						return box.left < star.right && box.right > star.left;
					});
					const target = hit ?? inBand[0];
					const box = target.getBoundingClientRect();
					const x = box.left + box.width / 2;
					const y = box.top + box.height / 2;
					const atCentre = target.ownerDocument.elementFromPoint(x, y);
					const starAtCentre = atCentre && atCentre.closest('[data-testid="assistant-open"]');

					expect(
						starAtCentre,
						`slot centre (${x.toFixed(1)}, ${y.toFixed(1)}) ` +
							`box ${box.left.toFixed(0)}..${box.right.toFixed(0)}×` +
							`${box.top.toFixed(0)}..${box.bottom.toFixed(0)} ` +
							`star ${star.left.toFixed(0)}..${star.right.toFixed(0)}×` +
							`${star.top.toFixed(0)}..${star.bottom.toFixed(0)} ` +
							`hit ${atCentre && (atCentre as Element).tagName}`
					).to.equal(null);
					expect(
						atCentre && atCentre.closest('[data-testid="agenda-slot-cell"]'),
						'the slot centre is the slot'
					).to.not.equal(null);
				});
		});

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			expect(box.width, 'star size at 390').to.be.closeTo(44, 1);
			expect(box.left, 'star stays on the left edge at 390').to.be.closeTo(0, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 390').to.be.closeTo(
				$star[0].ownerDocument.documentElement.clientHeight / 2,
				1
			);
		});

		cy.get('[data-testid="agenda-slot-cell"]').then(($cells) => {
			cy.get('[data-testid="assistant-open"]').should(($star) => {
				const star = $star[0].getBoundingClientRect();
				const sample = $cells[0];
				const box = sample.getBoundingClientRect();
				const x = box.left + box.width / 2;
				const y = box.top + box.height / 2;
				const atCentre = sample.ownerDocument.elementFromPoint(x, y);
				expect(
					atCentre && atCentre.closest('[data-testid="assistant-open"]'),
					`390 slot centre (${x.toFixed(1)}, ${y.toFixed(1)}) is not the star`
				).to.equal(null);
			});
		});
	});
});
