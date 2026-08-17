/**
 * #861: on a phone the star used to sit on the right, and a reviewer
 * row could scroll into its box. The right edge of Assign must not be
 * Guus. The rest state is the #729 trap — at rest the star covers
 * abstract text, so only a scrolled row proves the miss.
 *
 * Same hit as #859: the right edge of the control, elementFromPoint,
 * and the two boxes sharing no pixels. 768 and 1280 stay put.
 *
 * The flag comes from `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`),
 * the same source the other assistant specs trust.
 */
const uniqueSlug = () => `asg861-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk waiting on a reviewer';

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

const LONG_PROPOSAL = Array.from({ length: 24 }, (_, i) => `Proposal paragraph ${i + 1}.`).join(
	'\n\n'
);

function openTalk(slug: string) {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: [TALK],
				sessionStatus: 'submitted',
				committee: true,
				textAnswers: [{ label: 'Full proposal', value: LONG_PROPOSAL }]
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/submissions`);
	cy.waitForHydration();
	cy.contains('a', TALK).click();
	cy.waitForHydration();
	cy.get('[data-testid="review-assignments"]').should('exist');
}

describe('The assistant and Assign on a talk', () => {
	it('leaves Assign tappable at 390 after a scroll and keeps the star put at 768 and 1280', function () {
		if (!chatEnabled) this.skip();

		const slug = uniqueSlug();
		openTalk(slug);

		cy.viewport(PHONE.width, PHONE.height);
		cy.get('[data-testid="assistant-open"]').should('be.visible');
		cy.contains('[data-testid="assignment-reviewer"] button', 'Assign').should('exist');

		cy.get('[data-testid="assistant-open"]').then(($star) => {
			const star = $star[0].getBoundingClientRect();
			cy.contains('[data-testid="assignment-reviewer"] button', 'Assign').then(($assign) => {
				const assign = $assign[0].getBoundingClientRect();
				expect(
					assign.top,
					'Assign starts below the star so a scroll can bring it there'
				).to.be.greaterThan(star.bottom);

				const delta = assign.top + assign.height / 2 - (star.top + star.height / 2);
				const win = $assign[0].ownerDocument.defaultView;
				expect(win, 'the page has a window to scroll').to.not.equal(null);
				cy.scrollTo(0, Math.max(0, win!.scrollY + delta));
			});
		});

		cy.get('[data-testid="assistant-open"]').then(($star) => {
			cy.contains('[data-testid="assignment-reviewer"] button', 'Assign').should(($assign) => {
				const assign = $assign[0].getBoundingClientRect();
				const star = $star[0].getBoundingClientRect();
				const overlap =
					assign.left < star.right &&
					assign.right > star.left &&
					assign.top < star.bottom &&
					assign.bottom > star.top;
				expect(overlap, 'Assign and the assistant do not share pixels').to.equal(false);

				const x = assign.right - 4;
				const y = assign.top + assign.height / 2;
				const hit = $assign[0].ownerDocument.elementFromPoint(x, y);
				expect(
					hit && hit.closest('[data-testid="assistant-open"]'),
					'the right edge of Assign is not the assistant'
				).to.equal(null);
			});
		});

		// `fixed top-1/2` is clientHeight, not the Cypress window — same
		// classic-scrollbar gap #857 already documented for clientWidth.
		cy.viewport(TABLET.width, TABLET.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			const viewport = $star[0].ownerDocument.documentElement;
			expect(box.width, 'star size at 768').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 768').to.be.closeTo(viewport.clientWidth, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 768').to.be.closeTo(
				viewport.clientHeight / 2,
				1
			);
		});

		cy.viewport(DESKTOP.width, DESKTOP.height);
		cy.get('[data-testid="assistant-open"]').should(($star) => {
			const box = $star[0].getBoundingClientRect();
			const viewport = $star[0].ownerDocument.documentElement;
			expect(box.width, 'star size at 1280').to.be.closeTo(44, 1);
			expect(box.right, 'star on the right edge at 1280').to.be.closeTo(viewport.clientWidth, 1);
			expect(box.top + box.height / 2, 'star stays vertically centred at 1280').to.be.closeTo(
				viewport.clientHeight / 2,
				1
			);
		});
	});
});
