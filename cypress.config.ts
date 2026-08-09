import { defineConfig } from 'cypress';
import { config as loadEnv } from 'dotenv';
import { eq, isNull, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Load .env so the local Docker test database (port 5433) is picked up without
// exporting anything by hand. scripts/run-e2e.sh exports it as well.
loadEnv();

const TEST_USER_EMAIL_PREFIX = 'e2e-test-';

const connectionString =
	process.env.TEST_DATABASE_URL || 'postgres://root:mysecretpassword@localhost:5433/test';

console.log(`[Cypress] Using test database: ${connectionString.replace(/:[^:@]+@/, ':***@')}`);

export default defineConfig({
	e2e: {
		baseUrl: 'http://localhost:5174',
		specPattern: 'cypress/e2e/**/*.cy.ts',
		supportFile: 'cypress/support/e2e.ts',
		viewportWidth: 1280,
		viewportHeight: 720,

		// Playwright's sub-second action timeouts do not translate: Cypress
		// retries a single command until it passes, so the timeout is the budget
		// for "the element shows up", not for one attempt.
		defaultCommandTimeout: 8000,
		requestTimeout: 10000,
		responseTimeout: 30000,
		// The preview server is started right before the run; the first
		// navigation can be slow while SvelteKit warms up.
		pageLoadTimeout: 60000,

		retries: {
			runMode: 1,
			openMode: 0
		},

		screenshotOnRunFailure: true,
		video: false,
		trashAssetsBeforeRuns: true,

		// Each test starts from clean browser state; sessions are restored
		// explicitly through cy.login()/cy.session().
		testIsolation: true,

		experimentalRunAllSpecs: true,

		setupNodeEvents(on, config) {
			// One pooled connection with an idle timeout - Cypress keeps the config
			// process alive for the whole run, so an unbounded pool leaks.
			const client = postgres(connectionString, { idle_timeout: 30, max: 1 });
			const db = drizzle(client);

			async function loadSchema() {
				return await import('./src/lib/server/db/auth-schema');
			}

			on('task', {
				/**
				 * Delete every user whose email starts with the E2E prefix. Sessions,
				 * accounts, memberships and example objects cascade.
				 * Replaces e2e/db.ts cleanupTestUsers() + e2e/global.teardown.ts.
				 */
				async cleanupTestUsers() {
					try {
						const { user, verification, organization, member } = await loadSchema();

						const testUsers = await db
							.select({ id: user.id, email: user.email })
							.from(user)
							.where(like(user.email, `${TEST_USER_EMAIL_PREFIX}%`));

						if (testUsers.length > 0) {
							for (const u of testUsers) {
								await db.delete(verification).where(eq(verification.identifier, u.email));
							}
							await db.delete(user).where(like(user.email, `${TEST_USER_EMAIL_PREFIX}%`));
						}

						// Organizations have no owning user row, so deleting the last
						// member leaves them behind. Drop the orphans too.
						const orphans = await db
							.select({ id: organization.id })
							.from(organization)
							.leftJoin(member, eq(member.organizationId, organization.id))
							.where(isNull(member.id));
						for (const org of orphans) {
							await db.delete(organization).where(eq(organization.id, org.id));
						}

						return { cleaned: testUsers.length };
					} catch (error) {
						console.error('[Cypress] cleanupTestUsers failed:', error);
						return { cleaned: 0, error: String(error) };
					}
				},

				/**
				 * Wipe every user and organization, not just the E2E-prefixed ones.
				 * Needed by the first-user-admin spec, which asserts on behaviour that
				 * only happens when the user table is empty.
				 * Replaces e2e/db.ts cleanupDatabase().
				 */
				async resetDatabase() {
					try {
						const { user, verification, organization } = await loadSchema();
						await db.delete(verification);
						await db.delete(user);
						await db.delete(organization);
						return { success: true };
					} catch (error) {
						console.error('[Cypress] resetDatabase failed:', error);
						return { success: false, error: String(error) };
					}
				},

				/**
				 * drizzle-kit push against the test database.
				 * Replaces e2e/global.setup.ts. scripts/run-e2e.sh already does this
				 * before booting the server; kept for ad-hoc use from a spec.
				 */
				async pushDatabaseSchema() {
					try {
						const { execSync } = await import('child_process');
						execSync('npx drizzle-kit push --force', {
							stdio: 'inherit',
							env: { ...process.env, DATABASE_URL: connectionString }
						});
						return { success: true };
					} catch (error) {
						console.error('[Cypress] pushDatabaseSchema failed:', error);
						return { success: false, error: String(error) };
					}
				},

				/**
				 * Force a user's system role, so admin specs do not depend on who
				 * happened to register first.
				 */
				async setUserRole({ email, role }: { email: string; role: string }) {
					const { user } = await loadSchema();
					const updated = await db
						.update(user)
						.set({ role })
						.where(eq(user.email, email))
						.returning({ id: user.id, role: user.role });
					if (updated.length === 0) {
						throw new Error(`setUserRole: no user with email ${email}`);
					}
					return updated[0];
				},

				/**
				 * Stand-in for clicking the link in the verification email. UI sign-up
				 * always leaves emailVerified false, which sends the user to
				 * /verify-email instead of /home.
				 */
				async markEmailVerified(email: string) {
					const { user } = await loadSchema();
					const updated = await db
						.update(user)
						.set({ emailVerified: true })
						.where(eq(user.email, email))
						.returning({ id: user.id, emailVerified: user.emailVerified });
					if (updated.length === 0) {
						throw new Error(`markEmailVerified: no user with email ${email}`);
					}
					return updated[0];
				},

				async getUserByEmail(email: string) {
					const { user } = await loadSchema();
					const rows = await db
						.select({ id: user.id, email: user.email, role: user.role })
						.from(user)
						.where(eq(user.email, email))
						.limit(1);
					return rows[0] ?? null;
				},

				async countUsers() {
					const { user } = await loadSchema();
					const rows = await db.select({ value: sql<number>`count(*)::int` }).from(user);
					return rows[0]?.value ?? 0;
				},

				log(message: string) {
					console.log(message);
					return null;
				}
			});

			config.env = {
				...config.env,
				TEST_DATABASE_URL: connectionString
			};

			return config;
		}
	}
});
