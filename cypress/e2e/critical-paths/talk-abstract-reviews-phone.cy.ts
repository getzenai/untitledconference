/**
 * #858: after #854 the decision verbs wrap, but Abstract and Reviews
 * still grow the document. Live at 390 was scrollWidth 473 — a long
 * reviewer address and a recording URL have no break, the implicit
 * grid column sizes to that min-content, and the page slides sideways.
 *
 * Only a browser can prove it: the classes sit on the element either
 * way. The spec measures the document, because that is the symptom
 * an organizer feels, and the two boxes that produced the 473. 768
 * and 1280 are the guard: stacked below lg, two columns above it,
 * and neither width grows a scroller.
 */
const uniqueSlug = () => `ovf858-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk with a long recording link';
const RECORDING = `https://example.com/watch/${'x'.repeat(80)}`;

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

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
				reviewed: [TALK],
				textAnswers: [{ label: 'Link to a recording or slides', value: RECORDING }]
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/submissions`);
	cy.waitForHydration();
	cy.contains('a', TALK).click();
	cy.waitForHydration();
	cy.get('[data-testid="talk-content"]').should('exist');
	cy.get('[data-testid="submission-reviews"]').should('exist');
}

function pageFits() {
	cy.document().should((doc) => {
		const page = doc.documentElement;
		expect(page.scrollWidth, 'the page is no wider than the screen').to.be.at.most(
			page.clientWidth + 1
		);
	});
}

describe('Abstract and Reviews on a phone', () => {
	it('keep the page inside the screen at 390, and the columns put at 768 and 1280', () => {
		const slug = uniqueSlug();
		openTalk(slug);

		cy.viewport(PHONE.width, PHONE.height);
		pageFits();

		cy.get('[data-testid="talk-content"]').should(($card) => {
			const box = $card[0].getBoundingClientRect();
			expect(box.left, 'Abstract starts on screen').to.be.at.least(-1);
			expect(box.right, 'Abstract ends on screen').to.be.at.most(PHONE.width + 1);
		});
		cy.get('[data-testid="submission-reviews"]').should(($card) => {
			const box = $card[0].getBoundingClientRect();
			expect(box.left, 'Reviews starts on screen').to.be.at.least(-1);
			expect(box.right, 'Reviews ends on screen').to.be.at.most(PHONE.width + 1);
		});
		cy.get('[data-testid="review-reviewer-name"]').should(($name) => {
			const box = $name[0].getBoundingClientRect();
			expect(box.right, 'the reviewer address ends on screen').to.be.at.most(PHONE.width + 1);
			expect($name[0].scrollWidth, 'the reviewer address is not clipped').to.be.at.most(
				$name[0].clientWidth + 1
			);
		});
		cy.get('[data-testid="answer-link"]').should(($link) => {
			expect($link.text().trim(), 'the recording URL is still the whole URL').to.eq(RECORDING);
			const box = $link[0].getBoundingClientRect();
			expect(box.right, 'the recording URL ends on screen').to.be.at.most(PHONE.width + 1);
			expect($link[0].scrollWidth, 'the recording URL is not clipped').to.be.at.most(
				$link[0].clientWidth + 1
			);
		});

		// Below lg the two columns stay stacked — min-w-0 is not a wrap of the grid.
		cy.viewport(TABLET.width, TABLET.height);
		pageFits();
		cy.get('[data-testid="talk-content"]').then(($abstract) => {
			cy.get('[data-testid="submission-speakers"]').should(($speakers) => {
				const abstract = $abstract[0].getBoundingClientRect();
				const speakers = $speakers[0].getBoundingClientRect();
				expect(speakers.top, 'speakers stay under Abstract at 768').to.be.at.least(
					abstract.bottom - 1
				);
			});
		});

		// Above lg the two-column layout is unchanged.
		cy.viewport(DESKTOP.width, DESKTOP.height);
		pageFits();
		cy.get('[data-testid="talk-content"]').then(($abstract) => {
			cy.get('[data-testid="submission-speakers"]').should(($speakers) => {
				const abstract = $abstract[0].getBoundingClientRect();
				const speakers = $speakers[0].getBoundingClientRect();
				expect(speakers.left, 'speakers stay beside Abstract at 1280').to.be.at.least(
					abstract.right - 1
				);
			});
		});
	});
});
