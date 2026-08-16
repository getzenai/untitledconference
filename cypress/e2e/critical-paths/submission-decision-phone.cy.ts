/**
 * #852: the four decision verbs on a talk sat in one row that grew the
 * document. Accept painted as Acc, Edit talk as Edit, and there was no
 * "Scroll sideways" sentence — Talks and the agenda name their scroller;
 * this row just ran off the edge.
 *
 * Only a browser can prove the wrap: the classes sit on the element either
 * way. The spec measures the two things that fail separately. The page must
 * not scroll sideways — that is the symptom an organizer feels — and each
 * verb must keep its whole word inside the screen, because a row that merely
 * got clipped would satisfy the first check while Accept still reads Acc.
 *
 * 768 is the guard on the fix: the row is supposed to stay one line there.
 */
const uniqueSlug = () => `dec852-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk waiting on a decision';
const VERBS = ['Decline', 'Ask to resubmit', 'Waitlist', 'Accept'] as const;

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };

describe('The talk decision row on a phone', () => {
	it('keeps every verb labelled inside the screen', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK],
					sessionStatus: 'submitted'
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.viewport(PHONE.width, PHONE.height);
		cy.visit(`/manage/${slug}/submissions`);
		cy.waitForHydration();
		cy.contains('a', TALK).click();
		cy.waitForHydration();

		cy.get('[data-testid="decision-actions"]').should('exist');

		cy.document().should((doc) => {
			const page = doc.documentElement;
			expect(page.scrollWidth, 'the page is no wider than the screen').to.be.at.most(
				page.clientWidth + 1
			);
		});

		for (const verb of VERBS) {
			cy.contains('[data-testid="decision-actions"] button', verb).should(($button) => {
				expect($button.text().trim(), `${verb} keeps its whole word`).to.eq(verb);
				const box = $button[0].getBoundingClientRect();
				expect(box.left, `${verb} starts on screen`).to.be.at.least(-1);
				expect(box.right, `${verb} ends on screen`).to.be.at.most(PHONE.width + 1);
				expect($button[0].scrollWidth, `${verb} is not clipped`).to.be.at.most(
					$button[0].clientWidth + 1
				);
			});
		}

		// Above the breakpoint the row is unchanged: one line, Accept still whole.
		cy.viewport(TABLET.width, TABLET.height);
		cy.get('[data-testid="decision-actions"]').should(($row) => {
			const buttons = [...$row[0].querySelectorAll('button[name="decision"]')];
			expect(buttons, 'the four verbs').to.have.length(4);
			const tops = buttons.map((button) => button.getBoundingClientRect().top);
			expect(Math.max(...tops) - Math.min(...tops), 'one row at 768').to.be.at.most(1);

			const accept = buttons.find((button) => button.textContent?.trim() === 'Accept');
			if (!accept) throw new Error('Accept is in the row');
			const box = accept.getBoundingClientRect();
			expect(box.right, 'Accept ends on screen at 768').to.be.at.most(TABLET.width + 1);
			expect(accept.scrollWidth, 'Accept is not clipped at 768').to.be.at.most(
				accept.clientWidth + 1
			);
		});
	});
});
