import { AdminDashboardPage } from '../../support/pages/admin/dashboard.page';
import { HomePage } from '../../support/pages/home.page';

/**
 * Admin Operations - Critical Path
 *
 * Ported from e2e/critical-paths/admin-operations.test.ts. The Playwright
 * version pointed at `/admin`, which 404s in this app; the real dashboard is
 * /admin/users, guarded by src/routes/(admin)/+layout.server.ts.
 */
describe('Admin Operations - Critical Path', () => {
	const homePage = new HomePage();
	const adminDashboard = new AdminDashboardPage();

	it('Admin dashboard functionality assessment', () => {
		cy.createTestUser({ organizationName: 'Admin Org' }).then((user) => {
			// Promote before logging in so the session is created with the admin role.
			cy.task('setUserRole', { email: user.email, role: 'admin' });
			cy.login(user.email, user.password);

			// The admin nav group only renders for system admins.
			homePage.visit();
			homePage.shouldShowAdminNav();
			homePage.adminNavLink().click();
			cy.url({ timeout: 20000 }).should('include', '/admin/users');

			// Dashboard renders with the user list
			adminDashboard.shouldBeVisible();
			adminDashboard.shouldListUser(user.email);
			adminDashboard.userCount().should('be.greaterThan', 0);

			// Search filters the table client-side
			adminDashboard.searchUsers(user.email);
			adminDashboard.shouldListUser(user.email);
			adminDashboard.userCount().should('eq', 1);

			adminDashboard.searchUsers('no-such-user-should-match-nothing');
			adminDashboard.usersTable().should('not.contain.text', user.email);
		});
	});

	it('Access control verification', () => {
		cy.createTestUser({ organizationName: 'Regular Org' }).then((user) => {
			cy.login(user.email, user.password);

			// A regular user must not see the admin nav group
			homePage.visit();
			homePage.shouldNotShowAdminNav();

			// ...and direct navigation is redirected back to /home
			cy.visit('/admin/users');
			cy.url({ timeout: 20000 }).should('include', '/home');
			cy.url().should('not.include', '/admin');
		});
	});

	it('redirects unauthenticated visitors to /login with a returnTo', () => {
		cy.clearCookies();
		cy.visit('/admin/users');
		cy.url({ timeout: 20000 }).should('include', '/login');
		// The path, not the spelling — `returnTo=/admin/users` is the substring
		// that passed on the unencoded form and fails the moment the path is encoded.
		cy.location('search').should((search) => {
			expect(new URLSearchParams(search).get('returnTo')).to.eq('/admin/users');
		});
	});

	it('keeps a query on the admin URL through the login redirect', () => {
		cy.clearCookies();
		cy.visit('/admin/users?page=2');
		cy.url({ timeout: 20000 }).should('include', '/login');
		cy.location('search').should((search) => {
			expect(new URLSearchParams(search).get('returnTo')).to.eq('/admin/users?page=2');
		});
	});

	// Documents the admin workflow that is still unimplemented in the app.
	// Kept skipped, exactly as in the Playwright suite.
	//
	// Expected admin operations workflow:
	//   1. First user registration automatically becomes admin
	//   2. Admin can access the /admin/users dashboard
	//   3. Admin can view all users with statistics
	//   4. Admin can search users by email/name
	//   5. Admin can ban/unban users
	//   6. Admin can change user roles
	//   7. Admin can impersonate users for support
	//   8. Admin can manage organizations
	//   9. Admin can view system analytics
	it.skip('Future admin operations workflow (implementation pending)', () => {
		// Intentionally empty - see the checklist above.
	});
});
