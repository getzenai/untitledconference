/**
 * An organization can be deleted, and cannot be walked out of (#777).
 *
 * The bug this closes is quiet: `Leave Organization` as the only member removed
 * the membership row and left the organization behind with nobody in it —
 * invisible in every list, still owning its conferences, contacts and chat
 * backend. The page even promised "This will delete the organization", which it
 * never did.
 *
 * The delete itself is guarded because `organization.id` is referenced with
 * `onDelete: 'cascade'` from seven tables. So the interesting cases are the
 * refusals, not the success: an organization with an event attached must say
 * so rather than take the event with it.
 */
describe('Deleting an organization', () => {
	it('refuses to let the only member leave, and points at delete instead', () => {
		const organizationName = `Delete Org ${Date.now()}`;
		cy.createAndLogin({ organizationName }).then(() => {
			cy.setActiveOrganization(organizationName);
		});

		cy.visit('/settings/organization');
		cy.waitForHydration();

		cy.get('[data-testid="leave-organization"]').should('be.disabled');
		// The markup wraps, so match the claim rather than the exact line breaks.
		cy.get('[data-testid="leave-description"]')
			.invoke('text')
			.should('match', /only member/);
		cy.get('[data-testid="leave-description"]')
			.invoke('text')
			.should('match', /delete\s+it\s+below/);
	});

	it('will not delete while an event hangs off it, and names the reason', () => {
		const organizationName = `Blocked Org ${Date.now()}`;
		const slug = `delete-blocked-${Date.now()}`;

		cy.createAndLogin({ organizationName }).then((organizer) => {
			cy.setActiveOrganization(organizationName);
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/settings/organization');
		cy.waitForHydration();

		cy.get('[data-testid="delete-blockers"]').should('contain.text', '1 event');
		cy.get('[data-testid="delete-confirm-name"]').should('be.disabled');
		cy.get('[data-testid="delete-organization"]').should('be.disabled');
	});

	/**
	 * The guards live on the form action, so the question is whether anything
	 * else can delete. Better Auth's organization plugin publishes its own
	 * `POST /api/auth/organization/delete`, and that handler checks session,
	 * membership and the owner permission — then deletes, without ever seeing a
	 * conference, a member, an invitation or the typed name.
	 *
	 * The first request is the control: a 404 on a closed path and a 404 on a
	 * path that never existed look identical, so the neighbouring route has to
	 * answer 200 from the same router first. And the refusal is not the 404 —
	 * it is that the organization is still there afterwards.
	 */
	it('refuses the plugin route that would delete without the guards', () => {
		const organizationName = `Router Org ${Date.now()}`;
		cy.createAndLogin({ organizationName }).then(() => {
			cy.setActiveOrganization(organizationName);
		});

		cy.request('/api/auth/organization/list').then((listed) => {
			expect(listed.status, 'the organization router answers').to.eq(200);
			const organization = listed.body.find(
				(candidate: { name: string }) => candidate.name === organizationName
			);
			expect(organization, 'the organization exists to begin with').to.not.equal(undefined);

			cy.request({
				method: 'POST',
				url: '/api/auth/organization/delete',
				body: { organizationId: organization.id },
				failOnStatusCode: false
			})
				.its('status')
				.should('eq', 404);

			cy.request('/api/auth/organization/list')
				.its('body')
				.should((organizations: { name: string }[]) => {
					expect(organizations.map((candidate) => candidate.name)).to.include(organizationName);
				});
		});
	});

	it('deletes an empty organization once its name is typed exactly', () => {
		const organizationName = `Gone Org ${Date.now()}`;
		cy.createAndLogin({ organizationName }).then(() => {
			cy.setActiveOrganization(organizationName);
		});

		cy.visit('/settings/organization');
		cy.waitForHydration();
		cy.get('[data-testid="delete-blockers"]').should('not.exist');

		// A near miss is not a confirmation.
		cy.get('[data-testid="delete-confirm-name"]').type(organizationName.toLowerCase());
		cy.get('[data-testid="delete-organization"]').should('be.disabled');

		cy.get('[data-testid="delete-confirm-name"]').clear();
		cy.get('[data-testid="delete-confirm-name"]').type(organizationName);
		cy.get('[data-testid="delete-organization"]').should('not.be.disabled');
		cy.get('[data-testid="delete-organization"]').click();

		// Deleting the last organization leaves the account with none, so the app
		// sends them to create one — that is the app being right, not the test.
		cy.location('pathname', { timeout: 20000 }).should('eq', '/settings/organization/new');
		cy.waitForHydration();
		cy.contains(organizationName).should('not.exist');
	});

	/**
	 * Deleting the *active* organization while another one exists.
	 *
	 * The session carries `activeOrganizationId`, and that column has no foreign
	 * key — so the pointer survives the row it points at. The single-organization
	 * case above hides this: it lands on `/settings/organization/new`, which never
	 * asks who the active member is. With a second organization the settings list
	 * redirects into it, the membership is gone with the cascade, and the page
	 * bounces back to the list — a loop the user cannot leave.
	 *
	 * So the assertion is not "some page appeared" but that the surviving
	 * organization's settings actually render.
	 */
	it('lands on the surviving organization when the active one is deleted', () => {
		const doomed = `Doomed Org ${Date.now()}`;
		const survivor = `Survivor Org ${Date.now()}`;

		cy.createAndLogin({ organizationName: doomed }).then(() => {
			cy.request({
				method: 'POST',
				url: '/api/auth/organization/create',
				body: { name: survivor, slug: `survivor-${Date.now()}` }
			})
				.its('status')
				.should('eq', 200);
			cy.setActiveOrganization(doomed);
		});

		// The precondition the case rests on: two organizations, not one. Without
		// this the test would silently become the single-organization case again.
		cy.request('/api/auth/organization/list').its('body').should('have.length', 2);

		cy.visit('/settings/organization');
		cy.waitForHydration();
		cy.get('[data-testid="delete-confirm-name"]').type(doomed);
		cy.get('[data-testid="delete-organization"]').click();

		cy.request('/api/auth/organization/list').its('body').should('have.length', 1);
		cy.location('pathname', { timeout: 20000 }).should('match', /^\/settings\/organization/);
		cy.location('pathname').should('not.eq', '/settings/organization/new');
		cy.waitForHydration();
		cy.contains(survivor, { timeout: 20000 }).should('exist');
		cy.contains(doomed).should('not.exist');
	});
	/**
	 * The device that did not do the deleting (#803).
	 *
	 * Better Auth keeps the resolved session in a signed cookie for five
	 * minutes, so `getSession` stops asking Postgres. The deleting browser drops
	 * that cookie itself (#790); a second device cannot — its cache still names
	 * an organization that no longer exists, and every request built on it asks
	 * who the active member of a deleted organization is.
	 *
	 * The stale cookie *is* the second device: captured before the delete, put
	 * back afterwards. That is the same state a phone in a pocket is in, and it
	 * is reachable in one browser.
	 */
	it('recovers a device whose cached session still names the deleted organization', () => {
		const doomed = `Cached Org ${Date.now()}`;
		const survivor = `Cached Survivor ${Date.now()}`;

		cy.createAndLogin({ organizationName: doomed }).then(() => {
			cy.request({
				method: 'POST',
				url: '/api/auth/organization/create',
				body: { name: survivor, slug: `cached-survivor-${Date.now()}` }
			})
				.its('status')
				.should('eq', 200);
			cy.setActiveOrganization(doomed);
		});

		// Visiting writes the cache; this is the copy the second device holds.
		cy.visit('/settings/organization');
		cy.waitForHydration();
		cy.getCookie('better-auth.session_data').should('exist');
		cy.getCookie('better-auth.session_data').then((cached) => {
			cy.get('[data-testid="delete-confirm-name"]').type(doomed);
			cy.get('[data-testid="delete-organization"]').click();
			cy.location('pathname', { timeout: 20000 }).should('match', /^\/settings\/organization/);

			// Now be the device that never saw the delete.
			cy.setCookie('better-auth.session_data', cached!.value, { path: '/' });
			cy.visit('/settings/organization');
			cy.waitForHydration();
			cy.contains(survivor, { timeout: 20000 }).should('exist');
			cy.contains(doomed).should('not.exist');
		});
	});
});
