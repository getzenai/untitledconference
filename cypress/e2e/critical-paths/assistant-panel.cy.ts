/**
 * Application-wide assistant (#682).
 *
 * Same rule as the per-surface specs: the flag value comes from
 * `scripts/run-e2e.sh` (`CYPRESS_FEATURE_INAPP_CHAT`), never from whether the
 * star is in the DOM — a dead import or a 500 would read as "flag off".
 *
 * CI sets the flag on the E2E job (`lint_and_test.yaml`, since #693). The
 * same default lives in `run-e2e.sh`. `FEATURE_INAPP_CHAT=false` is the
 * path that asserts the star stays off the app. The mock treats `Rename the
 * conference <slug> to <name>` as `update_conference` so this spec never
 * calls a real provider.
 */
const uniqueSlug = () => `assistant-panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const chatEnabled =
	Cypress.env('FEATURE_INAPP_CHAT') === true || Cypress.env('FEATURE_INAPP_CHAT') === 'true';

function seedConference(name: string) {
	const slug = uniqueSlug();

	return cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				name,
				days: ['2028-05-10'],
				sessions: ['A talk to schedule']
			}
		})
			.its('status')
			.should('eq', 200);

		return cy.wrap({ slug, name });
	});
}

function openAssistant() {
	cy.get('[data-testid="assistant-open"]').should('be.visible').click();
	cy.get('[data-testid="assistant-panel"]').should('be.visible');
	cy.get('[data-testid="assistant-input"]').should('not.be.disabled');
}

function sendAssistant(text: string) {
	cy.get('[data-testid="assistant-input"]').type(text);
	cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').click();
}

describe('Assistant panel', () => {
	/**
	 * Reopening lands where the reader was, not at the oldest message (#729).
	 *
	 * The offset is read off the real viewport rather than from a screenshot:
	 * "looks right" cannot tell a panel that opened at the end from one that
	 * opened at the top of a conversation short enough to fit.
	 */
	it('reopens where it was left, and at the end when it was never moved (#729)', function () {
		if (!chatEnabled) this.skip();

		const filler = (n: number) =>
			`Question ${n}. ${'The panel needs enough height to scroll. '.repeat(12)}`;

		seedConference('Scroll Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/agenda`);
			cy.waitForHydration();
			openAssistant();

			sendAssistant(filler(1));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');
			sendAssistant(filler(2));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');

			// The precondition every assertion below rests on: there is
			// something to scroll. Without it "at the bottom" and "at the top"
			// are the same number and the case proves nothing.
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollHeight, 'the conversation is taller than the panel').to.be.greaterThan(
					$el[0].clientHeight + 50
				);
			});

			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop, 'opens at the end').to.be.greaterThan(
					$el[0].scrollHeight - $el[0].clientHeight - 40
				);
			});

			cy.get('[data-testid="assistant-scroll"]').scrollTo('top');
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop).to.eq(0);
			});

			cy.get('[data-testid="assistant-input"]').type('{esc}');
			cy.get('[data-testid="assistant-panel"]').should('not.exist');
			openAssistant();
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop, 'reopens where it was left').to.be.lessThan(40);
			});

			// New chat is a new conversation: nothing to remember, and nothing
			// to scroll either — the check is that the old offset is gone.
			cy.get('[data-testid="assistant-new-chat"]').click();
			cy.get('[data-testid="assistant-messages"] li').should('not.exist');
			sendAssistant(filler(3));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');
			cy.get('[data-testid="assistant-input"]').type('{esc}');
			openAssistant();
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop, 'a fresh conversation opens at the end').to.be.greaterThan(
					$el[0].scrollHeight - $el[0].clientHeight - 40
				);
			});
		});
	});

	/**
	 * The offset survives close and reopen — measured from the middle (#844).
	 *
	 * The case above leaves the reader at the *top* and asks for `< 40`, which
	 * a panel that restores nothing at all also satisfies: a freshly mounted
	 * viewport starts at 0. So it passed while every reopen showed the oldest
	 * message. Only a position that is neither 0 nor the end can tell "put
	 * back where it was" apart from "never moved".
	 */
	it('reopens in the middle when that is where the reader was (#844)', function () {
		if (!chatEnabled) this.skip();

		const filler = (n: number) =>
			`Question ${n}. ${'The panel needs enough height to scroll. '.repeat(12)}`;

		seedConference('Middle Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/agenda`);
			cy.waitForHydration();
			openAssistant();

			sendAssistant(filler(1));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');
			sendAssistant(filler(2));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');

			// The precondition: a middle has to exist. Without enough overhang
			// the middle, the top and the end collapse into one number and the
			// case would be green on any code.
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollHeight, 'the conversation is taller than the panel').to.be.greaterThan(
					$el[0].clientHeight + 200
				);
			});

			cy.get('[data-testid="assistant-scroll"]').then(($el) => {
				const middle = Math.round(($el[0].scrollHeight - $el[0].clientHeight) / 2);

				// Escape, then the X — the issue was reported through both, and
				// they are two different controls reaching the same setter.
				for (const close of ['escape', 'x'] as const) {
					cy.get('[data-testid="assistant-scroll"]').scrollTo(0, middle);
					cy.get('[data-testid="assistant-scroll"]').should(($v) => {
						expect(
							$v[0].scrollTop,
							`left in the middle before closing with ${close}`
						).to.be.closeTo(middle, 5);
					});

					if (close === 'escape') {
						cy.get('[data-testid="assistant-input"]').type('{esc}');
					} else {
						cy.get('[data-testid="assistant-panel"]').contains('button', 'Close').click();
					}
					cy.get('[data-testid="assistant-panel"]').should('not.exist');
					openAssistant();

					cy.get('[data-testid="assistant-scroll"]').should(($v) => {
						expect(
							$v[0].scrollTop,
							`reopens where it was left after ${close} (left at ${middle})`
						).to.be.closeTo(middle, 20);
					});
				}
			});
		});
	});

	it('stays off the app while FEATURE_INAPP_CHAT is off', function () {
		if (chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		cy.get('[data-testid="assistant-open"]').should('not.exist');
		cy.get('[data-testid="assistant-panel"]').should('not.exist');
	});

	/**
	 * Shrinking the panel keeps a reader who was at the end at the end (#743).
	 *
	 * This is the one geometry change with no event of its own: `scrollTop`
	 * does not move and no node changes, so without a `ResizeObserver` the flag
	 * goes on saying "at the end" while the end has moved away below — and the
	 * button back down only exists while the flag says otherwise.
	 */
	it('stays at the end when the panel gets shorter (#743)', function () {
		if (!chatEnabled) this.skip();

		const filler = (n: number) =>
			`Question ${n}. ${'The panel needs enough height to scroll. '.repeat(12)}`;

		seedConference('Resize Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/agenda`);
			cy.waitForHydration();
			openAssistant();

			sendAssistant(filler(1));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');
			sendAssistant(filler(2));
			cy.get('[data-testid="assistant-pending"]').should('not.exist');

			// The precondition: there is an overhang to lose. Without it the
			// resize changes nothing and the case would pass on any code.
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollHeight, 'the conversation is taller than the panel').to.be.greaterThan(
					$el[0].clientHeight + 100
				);
			});
			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop, 'starts at the end').to.be.greaterThan(
					$el[0].scrollHeight - $el[0].clientHeight - 40
				);
			});

			// Half the height: the overhang grows by everything that no longer
			// fits, and nothing fires a scroll or a mutation.
			cy.viewport(1000, 400);

			cy.get('[data-testid="assistant-scroll"]').should(($el) => {
				expect($el[0].scrollTop, 'still at the end after the panel shrank').to.be.greaterThan(
					$el[0].scrollHeight - $el[0].clientHeight - 40
				);
			});
			// The flag agrees with the position, which is what the button reads.
			cy.get('[data-testid="assistant-panel"] [aria-label="Scroll to the latest message"]').should(
				'not.exist'
			);
		});
	});

	it('opens the sheet from the star and closes it again', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
		cy.get('[data-testid="assistant-panel"]').contains('Close').click();
		cy.get('[data-testid="assistant-panel"]').should('not.exist');
		cy.get('[data-testid="assistant-open"]').should('be.visible');
	});

	it('keeps the transcript when the sheet closes, and New chat empties it', function () {
		if (!chatEnabled) this.skip();

		const asked = `Keep this turn ${Date.now()}`;

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
		cy.get('[data-testid="assistant-new-chat"]').should('not.exist');
		sendAssistant(asked);
		cy.get('[data-testid="assistant-messages"]').should('contain.text', asked);
		cy.get('[data-testid="assistant-panel"]').contains('Close').click();
		cy.get('[data-testid="assistant-panel"]').should('not.exist');

		openAssistant();
		cy.get('[data-testid="assistant-messages"]').should('contain.text', asked);

		cy.get('[data-testid="assistant-new-chat"]').should('be.visible').click();
		cy.get('[data-testid="assistant-messages"]').should('not.contain.text', asked);
		cy.get('[data-testid="assistant-new-chat"]').should('not.exist');
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
	});

	it('keeps a typed unsent question when the sheet closes, and New chat empties it', function () {
		if (!chatEnabled) this.skip();

		const typed = `Half typed ${Date.now()}`;
		const sent = `Sent turn ${Date.now()}`;

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
		cy.get('[data-testid="assistant-input"]').type(typed);
		cy.get('[data-testid="assistant-panel"]').contains('Close').click();
		cy.get('[data-testid="assistant-panel"]').should('not.exist');

		openAssistant();
		cy.get('[data-testid="assistant-input"]').should('have.value', typed);

		cy.get('[data-testid="assistant-input"]').clear();
		sendAssistant(sent);
		cy.get('[data-testid="assistant-messages"]').should('contain.text', sent);
		cy.get('[data-testid="assistant-input"]').type(typed);
		cy.get('[data-testid="assistant-new-chat"]').should('be.visible').click();
		cy.get('[data-testid="assistant-messages"]').should('not.contain.text', sent);
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
	});

	it('leaves the input empty after send, close, and reopen', function () {
		if (!chatEnabled) this.skip();

		const asked = `Sent then closed ${Date.now()}`;

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();
		sendAssistant(asked);
		cy.get('[data-testid="assistant-messages"]').should('contain.text', asked);
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
		cy.get('[data-testid="assistant-panel"]').contains('Close').click();
		cy.get('[data-testid="assistant-panel"]').should('not.exist');

		openAssistant();
		cy.get('[data-testid="assistant-messages"]').should('contain.text', asked);
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
	});

	it('sends the page context of the page the user is on, not the one the panel opened on', function () {
		if (!chatEnabled) this.skip();

		seedConference('Context Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/dashboard`);
			cy.waitForHydration();
			openAssistant();

			// The overlay sits above the rail, so the sheet has to close before
			// the client navigation. The launcher keeps the Chat instance —
			// context is still read at send, not at first open.
			cy.get('[data-testid="assistant-panel"]').contains('Close').click();
			// Desktop rail and the mobile sheet both mount the same nav.
			cy.get('[data-testid="conference-nav-agenda"]:visible').click();
			cy.url().should('include', `/manage/${slug}/agenda`);
			cy.get('h1').should('contain.text', 'Agenda');
			openAssistant();

			cy.intercept('POST', '/chat', (req) => {
				const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
				expect(body.pageContext, 'pageContext is sent').to.be.an('object');
				expect(body.pageContext.title).to.eq('Agenda');
				expect(body.pageContext.url).to.include(`/manage/${slug}/agenda`);
				expect(body.pageContext.params).to.deep.include({ slug });
				expect(body.pageContext.routeId).to.include('agenda');
				expect(body.pageContext.title).to.not.eq('Dashboard');
				expect(body.pageContext.title).to.not.eq('Set up this event');
			}).as('assistantChat');

			sendAssistant('What is on this page?');
			cy.wait('@assistantChat');
		});
	});

	it('runs a reversible write without a card and refreshes the page behind the sheet', function () {
		if (!chatEnabled) this.skip();

		const original = `Old Name ${Date.now()}`;
		const renamed = `New Name ${Date.now()}`;

		seedConference(original).then(({ slug }) => {
			cy.visit('/home');
			cy.waitForHydration();
			cy.get('[data-testid="home-dashboard"]').should('contain.text', original);
			openAssistant();
			sendAssistant(`Rename the conference ${slug} to ${renamed}`);

			cy.get('[data-testid="assistant-approval"]').should('not.exist');

			// The sheet stays open; the name on the hub behind it is the page
			// data, not the transcript.
			cy.get('[data-testid="home-dashboard"]').should('contain.text', renamed);
			cy.get('[data-testid="home-dashboard"]').should('not.contain.text', original);
		});
	});

	it('grows with the text, caps a long paste, and sends on Enter', function () {
		if (!chatEnabled) this.skip();

		cy.viewport(390, 844);
		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();

		cy.get('[data-testid="assistant-input"]').then(($input) => {
			const oneRow = $input[0].clientHeight;
			cy.wrap($input).type(
				'one{shift+enter}two{shift+enter}three{shift+enter}four{shift+enter}five'
			);
			cy.get('[data-testid="assistant-input"]').should(($grown) => {
				expect($grown[0].clientHeight, 'five lines are visible').to.be.greaterThan(oneRow);
				expect($grown[0].scrollHeight, 'five lines do not scroll yet').to.be.at.most(
					$grown[0].clientHeight + 2
				);
			});
		});

		const twenty = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n');
		cy.get('[data-testid="assistant-input"]').clear().invoke('val', twenty).trigger('input');
		cy.get('[data-testid="assistant-input"]').should(($capped) => {
			expect($capped[0].scrollHeight, 'a twenty-line paste scrolls').to.be.greaterThan(
				$capped[0].clientHeight
			);
		});
		cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').should('be.visible');

		cy.intercept('POST', '/chat').as('assistantChat');
		cy.get('[data-testid="assistant-input"]').clear().type('keep{shift+enter}going');
		cy.get('@assistantChat.all').should('have.length', 0);
		cy.get('[data-testid="assistant-input"]').should('have.value', 'keep\ngoing');

		cy.get('[data-testid="assistant-input"]').type('{enter}');
		cy.wait('@assistantChat');
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
		cy.get('[data-testid="assistant-input"]').should(($reset) => {
			expect($reset[0].scrollHeight, 'height resets after send').to.be.at.most(
				$reset[0].clientHeight + 2
			);
		});
	});

	it('swaps send for stop and keeps the stopped turn', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();

		cy.intercept('POST', '/chat', (req) => {
			req.reply({ delay: 30_000, statusCode: 200, body: '' });
		}).as('hungChat');

		sendAssistant('Please go on for a while');
		cy.get('[data-testid="assistant-stop"]').should('be.visible');
		cy.get('[data-testid="assistant-input"]').should('be.disabled');
		cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').should('not.exist');

		cy.get('[data-testid="assistant-stop"]').click();
		cy.get('[data-testid="assistant-stop"]').should('not.exist');
		cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').should('be.visible');
		cy.get('[data-testid="assistant-input"]').should('not.be.disabled');
		cy.get('[data-testid="assistant-stopped"]').should('be.visible');

		cy.intercept('POST', '/chat').as('nextTurn');
		sendAssistant('Try again');
		cy.wait('@nextTurn');
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
	});

	it('marks the stopped later turn, not a finished earlier answer', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();

		sendAssistant('What can I do here?');
		cy.get('[data-testid="assistant-messages"] [data-role="assistant"]').should('exist');
		cy.get('[data-testid="assistant-pending"]').should('not.exist');
		cy.get('[data-testid="assistant-panel"] [aria-label="Send"]').should('be.visible');
		cy.get('[data-testid="assistant-messages"] [data-role="assistant"]').should(
			'not.contain.text',
			'Stopped'
		);

		cy.intercept('POST', '/chat', (req) => {
			req.reply({ delay: 30_000, statusCode: 200, body: '' });
		}).as('hungSecondTurn');

		sendAssistant('Please go on for a while');
		cy.get('[data-testid="assistant-stop"]').should('be.visible').click();
		cy.get('[data-testid="assistant-stop"]').should('not.exist');
		cy.get('[data-testid="assistant-stopped"]').should('have.length', 1);
		cy.get('[data-testid="assistant-messages"] [data-role="assistant"]').should(
			'not.contain.text',
			'Stopped'
		);
		cy.get('[data-testid="assistant-messages"] [data-role="user"]')
			.last()
			.find('[data-testid="assistant-stopped"]')
			.should('be.visible');
	});

	it('fills the input from a chip and does not send', function () {
		if (!chatEnabled) this.skip();

		seedConference('Chip Summit').then(({ slug }) => {
			cy.visit(`/manage/${slug}/agenda`);
			cy.waitForHydration();
			openAssistant();

			cy.intercept('POST', '/chat').as('assistantChat');
			cy.get('[data-testid="assistant-description"]').should(($line) => {
				expect($line.text()).to.not.match(/this page|say yes|ask about/i);
			});
			cy.get('[data-testid="assistant-suggestion"]').should(
				'contain.text',
				"What's still unscheduled?"
			);
			cy.get('[data-testid="assistant-suggestion"]').contains("What's still unscheduled?").click();
			cy.get('[data-testid="assistant-input"]').should('have.value', "What's still unscheduled?");
			cy.get('@assistantChat.all').should('have.length', 0);
			cy.get('[data-testid="assistant-messages"] [data-role="user"]').should('not.exist');
		});
	});

	it('fills a fallback chip on a page with no specific openers', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();

		cy.intercept('POST', '/chat').as('assistantChat');
		cy.get('[data-testid="assistant-description"]').should(($line) => {
			expect($line.text()).to.not.match(/this page|say yes|ask about/i);
		});
		cy.get('[data-testid="assistant-suggestion"]')
			.first()
			.then(($chip) => {
				const text = $chip.text().trim();
				expect(text.length, 'a chip names something').to.be.greaterThan(0);
				cy.wrap($chip).click();
				cy.get('[data-testid="assistant-input"]').should('have.value', text);
			});
		cy.get('@assistantChat.all').should('have.length', 0);
		cy.get('[data-testid="assistant-messages"] [data-role="user"]').should('not.exist');
	});

	it('hides chips after a send and brings them back on a new chat', function () {
		if (!chatEnabled) this.skip();

		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();
		openAssistant();

		cy.get('[data-testid="assistant-suggestions"]').should('be.visible');
		sendAssistant('What can I do here?');
		cy.get('[data-testid="assistant-pending"]').should('not.exist');
		cy.get('[data-testid="assistant-suggestions"]').should('not.exist');

		cy.get('[data-testid="assistant-new-chat"]').click();
		cy.get('[data-testid="assistant-suggestions"]').should('be.visible');
		cy.get('[data-testid="assistant-input"]').should('have.value', '');
	});
});
