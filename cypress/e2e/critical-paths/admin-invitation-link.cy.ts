/**
 * The invitation link, end to end — and the oracle that used to sit next to it (#395).
 *
 * Two things have to stay true at once, and they pull in opposite directions:
 * the admin must get a working link out of the dialog, and a visitor who does
 * not hold that exact token must get nothing. `/complete-registration?token=%`
 * used to satisfy the second person as well as the first, because the token
 * went into a SQL LIKE pattern unescaped.
 *
 * Both halves are checked in the browser because both changed underneath:
 * the link is now handed from Better Auth's callback to the admin action in
 * memory instead of through a database column, and the page resolves the token
 * by exact match instead of by pattern.
 */
describe('Admin invitation link', () => {
	it('hands the admin a working link, and gives a wildcard nothing', () => {
		const invitee = `invitee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

		cy.createTestUser({ organizationName: 'Invite Org' }).then((admin) => {
			cy.task('setUserRole', { email: admin.email, role: 'admin' });
			cy.login(admin.email, admin.password);

			cy.visit('/admin/users');
			cy.waitForHydration();

			cy.contains('button', 'Invite User').click();
			cy.get('#invite-email').type(invitee);
			cy.contains('button', 'Create Invitation').click();

			// The link is only here if the in-memory handoff worked. A timeout
			// here means the callback no longer runs inside requestPasswordReset.
			cy.contains('Invitation Created', { timeout: 20000 }).should('be.visible');
			cy.get('input[readonly]')
				.invoke('val')
				.then((value) => {
					const link = String(value);
					expect(link, 'invitation link').to.include('/reset-password/');

					const token = link.split('/reset-password/')[1].split('?')[0];
					expect(token, 'reset token').to.have.length.greaterThan(16);

					// The invitee is not the admin: start from no session at all.
					cy.clearCookies();

					// A LIKE wildcard matched every pending invitation before the
					// fix, which is how the email leaked and how the token was
					// read back a character at a time. Now it is a token that
					// does not exist, and the page sends it to /login.
					const patterns = ['%', '_'.repeat(token.length), `${token.slice(0, 4)}%`];
					for (const pattern of patterns) {
						cy.visit(`/complete-registration?token=${encodeURIComponent(pattern)}`);
						cy.url({ timeout: 20000 }).should('include', '/login');
					}

					// The real token, last: setting the password spends it, so the
					// probes above have to run while it is still live. This is the
					// half that proves the fix did not just close the door on
					// everyone — invitation, link, password, session.
					cy.visit(`/complete-registration?token=${encodeURIComponent(token)}`);
					cy.waitForHydration();
					cy.contains('Complete your registration').should('be.visible');
					cy.url().should('include', '/complete-registration');

					cy.get('input[name="password"]').type('Invitee-Sets-This-1!');
					cy.contains('button', 'Complete Registration').click();

					// Landing on /home means resetPassword and the auto sign-in both
					// went through: the invitee is holding a session.
					cy.url({ timeout: 20000 }).should('include', '/home');
				});
		});
	});
});
