/**
 * The panel follows the answer being written, not the bottom of the list (#718).
 *
 * Same gate as the other assistant specs: the flag comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`), and CI leaves it off.
 * `FEATURE_INAPP_CHAT=true AI_CHAT_MODEL=mock` is the local path.
 *
 * "Tell me something long" is the mock's sentence for an answer that outgrows
 * the panel (see `src/lib/server/chat/model.ts`) — the only shape in which the
 * difference between "follow the message" and "scroll to the bottom" shows.
 *
 * The second and third cases grow the answer by hand instead of waiting for the
 * next chunk of a real stream. What the follow logic actually reacts to is a
 * mutation inside the viewport, so appending to the last message is the same
 * event; and a test that waits for a chunk it cannot schedule either goes flaky
 * or quietly asserts nothing. The pair matters: the control case proves the
 * mechanism is live, so the disengage case cannot pass by doing nothing.
 */
const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

const LAST_PARAGRAPH = 'Paragraph 24 of a long answer';

/** The scrolling box the messages sit in. */
function scroller() {
	return cy.get('[data-testid="assistant-messages"]').parent();
}

function openAssistant() {
	cy.get('[data-testid="assistant-open"]').should('be.visible').click();
	cy.get('[data-testid="assistant-panel"]').should('be.visible');
	cy.get('[data-testid="assistant-input"]').should('not.be.disabled');
}

/** Ask, and wait until the whole answer is on screen. */
function receiveALongAnswer() {
	cy.get('[data-testid="assistant-input"]').type('Tell me something long');
	cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').click();
	cy.get('[data-testid="assistant-pending"]', { timeout: 20000 }).should('not.exist');
	cy.contains(LAST_PARAGRAPH).should('exist');
}

/** Another screenful of answer, as if the next chunk had arrived. */
function growTheAnswer() {
	cy.get('[data-testid="assistant-messages"] li')
		.last()
		.then(($message) => {
			const more = document.createElement('p');
			more.style.height = '800px';
			more.textContent = 'More of the answer.';
			$message[0].appendChild(more);
		});
}

describe('Assistant follows its own answer', () => {
	beforeEach(function () {
		if (!chatEnabled) this.skip();
		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
	});

	it('pins a long answer at its top instead of dragging the reader to the bottom', () => {
		receiveALongAnswer();

		scroller().should(($element) => {
			const element = $element[0];
			const room = element.scrollHeight - element.clientHeight;
			expect(room, 'the answer is taller than the panel').to.be.greaterThan(0);
			// Following the *message* leaves the end of a long answer below the
			// fold. Following the *bottom* would have landed on `room`.
			expect(element.scrollTop, 'the panel did not chase the end').to.be.lessThan(room - 1);
		});
	});

	it('follows the answer as it grows', () => {
		receiveALongAnswer();

		scroller().then(($element) => {
			const before = $element[0].scrollTop;
			growTheAnswer();
			scroller().should(($after) => {
				expect($after[0].scrollTop, 'the panel moved with the answer').to.be.greaterThan(before);
			});
		});
	});

	it('stops following once the reader scrolls away, and offers the way back', () => {
		receiveALongAnswer();

		scroller().scrollTo('top');
		scroller().trigger('wheel', { deltaY: -120 });

		scroller().then(($element) => {
			const parked = $element[0].scrollTop;
			growTheAnswer();
			// Give the follow every chance to fire before believing it did not.
			cy.wait(300);
			scroller().should(($after) => {
				expect($after[0].scrollTop, 'the reader was left where they parked').to.eq(parked);
			});
		});

		// Away from the end, the way back is on offer — and it works.
		cy.get('[data-testid="assistant-scroll-to-bottom"]').should('be.visible').click();
		scroller().should(($element) => {
			const element = $element[0];
			expect(element.scrollTop + element.clientHeight).to.be.greaterThan(element.scrollHeight - 40);
		});
		cy.get('[data-testid="assistant-scroll-to-bottom"]').should('not.exist');
	});
});
