/**
 * #489: Send queued must be dead before the click when mail is unconfigured,
 * and must ask before it dispatches when a transport is present.
 *
 * The confirm itself is invisible to the unit suite: a closed `AlertDialog`
 * renders nothing on the server. `bulk-decide-confirm.cy.ts` and
 * `recuse-confirm.cy.ts` exist for the same reason.
 *
 * Two pictures, in this order:
 *
 * 1. Unconfigured — the case #472 was filed about. `run-e2e.sh` already
 *    unsets the Resend key, so the button is grey before anyone clicks.
 * 2. Configured but deaf — a recording fake behind ENABLE_TEST_ENDPOINTS,
 *    armed after the mail is queued (compose itself flushes, and would send
 *    immediately if the fake were already on). The load-bearing assertion is
 *    the one after Cancel: nothing was sent, checked after a reload.
 */
const uniqueSlug = () => `send489-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SUBJECT = 'You are on the programme';

describe('Send queued', () => {
	let slug: string;
	let suffix: string;

	beforeEach(() => {
		slug = uniqueSlug();
		suffix = slug.slice('send489-'.length);
		// A leftover arm from a previous spec must not paint this one live.
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/mail-transport`,
			body: { enabled: false },
			failOnStatusCode: false
		});

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: [], sessions: [] }
			})
				.its('status')
				.should('eq', 200);

			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/add`,
				form: true,
				headers: { Origin: Cypress.config('baseUrl') as string },
				body: {
					name: 'Ada Lovelace',
					email: `ada-${suffix}@example.test`,
					status: 'confirmed'
				}
			})
				.its('status')
				.should('eq', 200);

			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/compose`,
				form: true,
				headers: { Origin: Cypress.config('baseUrl') as string },
				body: { subject: SUBJECT, body: 'See you in May.' }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('greys the button before anyone clicks when delivery is not configured', () => {
		cy.visit(`/manage/${slug}/dashboard`);
		cy.waitForHydration();

		cy.get('[data-testid="mail-panel-copy"]').should(
			'contain.text',
			'Mail delivery is not configured.'
		);
		cy.get('[data-testid="send-queued"]').should('be.disabled');
		cy.contains('1 queued · 0 sent · 0 failed').should('exist');

		// Disabled is the courtesy; the force-click is the honest check that the
		// POST does not go out underneath it.
		cy.get('[data-testid="send-queued"]').click({ force: true });
		cy.get('[data-testid="dispatch-mail-dialog"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		cy.contains('1 queued · 0 sent · 0 failed').should('exist');
		cy.get('[data-testid="send-queued"]').should('be.disabled');
	});

	describe('when delivery is configured but cannot leave the machine', () => {
		beforeEach(() => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/mail-transport`,
				body: { enabled: true }
			})
				.its('body.enabled')
				.should('eq', true);
		});

		afterEach(() => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/mail-transport`,
				body: { enabled: false }
			});
		});

		it('keeps the outbox queued when the organizer backs out of the dialog', () => {
			cy.visit(`/manage/${slug}/dashboard`);
			cy.waitForHydration();

			cy.get('[data-testid="send-queued"]').should('not.be.disabled');
			cy.get('[data-testid="send-queued"]').click();

			cy.get('[data-testid="dispatch-mail-dialog"]').should('be.visible');
			cy.get('[data-testid="dispatch-mail-cancel"]').click();
			cy.get('[data-testid="dispatch-mail-dialog"]').should('not.exist');

			// The reload is the honest check: a send that reached the dispatcher
			// would come back as sent even if this screen still looked untouched.
			cy.reload();
			cy.waitForHydration();
			cy.contains('1 queued · 0 sent · 0 failed').should('exist');
			cy.get('[data-testid="send-queued"]').should('not.be.disabled');
			cy.request(`${Cypress.config('baseUrl')}/api/v1/test/mail-transport`)
				.its('body.delivered')
				.should('eq', 0);
		});

		it('hands the row to the fake once they confirm', () => {
			cy.visit(`/manage/${slug}/dashboard`);
			cy.waitForHydration();

			cy.get('[data-testid="send-queued"]').click();
			cy.get('[data-testid="dispatch-mail-confirm"]').click();

			cy.get('[data-testid="mail-panel-copy"]').should('contain.text', '1 sent');
			cy.contains('0 queued · 1 sent · 0 failed').should('exist');
			cy.request(`${Cypress.config('baseUrl')}/api/v1/test/mail-transport`)
				.its('body.delivered')
				.should('eq', 1);
		});
	});
});
