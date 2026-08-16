import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createLogger } from '../logger';
import * as authSchema from './auth-schema';
import * as cfpSchema from './conference/cfp-schema';
import * as conferenceSchema from './conference/conference-schema';
import * as contentSchema from './conference/content-schema';
import * as emailSchema from './conference/email-schema';
import * as programSchema from './conference/program-schema';
import * as reviewSchema from './conference/review-schema';
import * as organizationAiSchema from './organization-ai-schema';

const logger = createLogger('TestUtils');

// Test database connections map - one per test file to avoid connection issues
const testConnections = new Map<
	string,
	{
		client: ReturnType<typeof postgres>;
		db: ReturnType<typeof drizzle> & { $client: ReturnType<typeof postgres> };
	}
>();

/**
 * Creates a test database connection using TEST_DATABASE_URL
 * This connection is separate from the main application database
 * Creates a new connection for each unique connectionId to avoid connection pooling issues
 */
export function createTestDatabase(connectionId: string = 'default') {
	let connection = testConnections.get(connectionId);

	if (!connection) {
		const testDatabaseUrl = process.env.TEST_DATABASE_URL;
		if (!testDatabaseUrl) {
			throw new Error('TEST_DATABASE_URL environment variable is required for tests');
		}

		const client = postgres(testDatabaseUrl, {
			max: 1, // Single connection per test file
			idle_timeout: 20,
			connect_timeout: 10
		});
		const db = drizzle(client, {
			schema: {
				...authSchema,
				...conferenceSchema,
				...cfpSchema,
				...reviewSchema,
				...programSchema,
				...contentSchema,
				...emailSchema,
				...organizationAiSchema
			}
		});
		// Add the $client property for transaction support
		const dbWithClient = Object.assign(db, { $client: client });

		connection = { client, db: dbWithClient };
		testConnections.set(connectionId, connection);
	}

	return connection.db;
}

/**
 * Closes the test database connection for a specific connectionId
 * Call this in test cleanup to prevent connection leaks
 */
export async function closeTestDatabase(connectionId: string = 'default') {
	const connection = testConnections.get(connectionId);
	if (connection) {
		await connection.client.end();
		testConnections.delete(connectionId);
	}
}

/**
 * Closes all test database connections
 * Useful for global test cleanup
 */
export async function closeAllTestDatabases() {
	for (const [_id, connection] of testConnections.entries()) {
		await connection.client.end();
	}
	testConnections.clear();
}

/**
 * Completely cleans up the test database by removing all data
 * Use this for test isolation between test suites
 */
export async function cleanupTestDatabase(connectionId: string = 'default') {
	const db = createTestDatabase(connectionId);

	try {
		// Order matters due to foreign key constraints
		// Delete in reverse dependency order to avoid foreign key violations

		// Delete organization-related data
		await db.delete(organizationAiSchema.organizationAiSettings);
		await db.delete(authSchema.invitation);
		await db.delete(authSchema.member);
		await db.delete(authSchema.organization);

		// Delete user-related data (sessions and accounts will cascade)
		await db.delete(authSchema.verification);
		await db.delete(authSchema.session);
		await db.delete(authSchema.account);
		await db.delete(authSchema.user);
	} catch (error) {
		logger.error('Error during test database cleanup', error as Error);
		throw error;
	}
}

/**
 * Creates consistent test data fixtures
 * Provides standard test entities for use across tests
 */
export async function seedTestData(connectionId: string = 'default'): Promise<TestFixtures> {
	const users = await createTestUsers(connectionId);
	const organization = await createTestOrganization(
		{
			name: 'Test Organization',
			slug: 'test-org'
		},
		connectionId
	);

	await setupOrganizationMembership(organization.id, users, connectionId);

	return {
		users,
		organization
	};
}

/**
 * Helper function to create all test users for seeding
 */
async function createTestUsers(connectionId: string = 'default') {
	const user1 = await createTestUser(
		{
			email: 'test-user-1@example.com',
			name: 'Test User 1',
			role: 'user'
		},
		connectionId
	);

	const user2 = await createTestUser(
		{
			email: 'test-user-2@example.com',
			name: 'Test User 2',
			role: 'user'
		},
		connectionId
	);

	const admin = await createTestUser(
		{
			email: 'admin-user@example.com',
			name: 'Admin User',
			role: 'admin'
		},
		connectionId
	);

	return { user1, user2, admin };
}

/**
 * Helper function to setup organization membership
 */
async function setupOrganizationMembership(
	organizationId: string,
	users: { user1: TestUser; user2: TestUser; admin: TestUser },
	connectionId: string = 'default'
) {
	const db = createTestDatabase(connectionId);

	await db.insert(authSchema.member).values([
		{
			id: generateId(),
			organizationId,
			userId: users.user1.id,
			role: 'owner'
		},
		{
			id: generateId(),
			organizationId,
			userId: users.user2.id,
			role: 'member'
		}
	]);
}

/**
 * Helper function to create a test user
 * Returns the created user with generated ID
 */
export async function createTestUser(
	userData: {
		email: string;
		name?: string;
		role?: string;
		emailVerified?: boolean;
	},
	connectionId: string = 'default'
): Promise<TestUser> {
	const db = createTestDatabase(connectionId);

	const user = {
		id: generateId(),
		email: userData.email,
		name: userData.name || 'Test User',
		role: userData.role || 'user',
		emailVerified: userData.emailVerified ?? true,
		banned: false,
		createdAt: new Date(),
		updatedAt: new Date()
	};

	const [createdUser] = await db.insert(authSchema.user).values(user).returning();
	return createdUser;
}

/**
 * Helper function to create a test organization
 * Returns the created organization with generated ID
 */
export async function createTestOrganization(
	orgData: {
		name: string;
		slug?: string;
	},
	connectionId: string = 'default'
): Promise<TestOrganization> {
	const db = createTestDatabase(connectionId);

	const organization = {
		id: generateId(),
		name: orgData.name,
		slug: orgData.slug || generateSlug(orgData.name),
		createdAt: new Date()
	};

	const [createdOrg] = await db.insert(authSchema.organization).values(organization).returning();
	return createdOrg;
}

/**
 * Creates a test user session for authentication testing
 * Returns session token for use in authenticated requests
 */
export async function createTestSession(
	userId: string,
	activeOrganizationId?: string,
	connectionId: string = 'default'
): Promise<TestSession> {
	const db = createTestDatabase(connectionId);

	const session = {
		id: generateId(),
		userId,
		token: generateSessionToken(),
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
		createdAt: new Date(),
		updatedAt: new Date(),
		activeOrganizationId
	};

	const [createdSession] = await db.insert(authSchema.session).values(session).returning();
	return createdSession;
}

/**
 * Helper to create test organization membership
 */
export async function createTestMembership(
	params: {
		organizationId: string;
		userId: string;
		role: 'owner' | 'admin' | 'member';
	},
	connectionId: string = 'default'
): Promise<TestMember> {
	const db = createTestDatabase(connectionId);

	const member = {
		id: generateId(),
		organizationId: params.organizationId,
		userId: params.userId,
		role: params.role,
		createdAt: new Date()
	};

	const [createdMember] = await db.insert(authSchema.member).values(member).returning();
	return createdMember;
}

/**
 * Transaction wrapper for test isolation
 * Runs test function within a transaction that can be rolled back
 */
export async function withTestTransaction<T>(
	testFn: (
		tx: Parameters<Parameters<ReturnType<typeof createTestDatabase>['transaction']>[0]>[0]
	) => Promise<T>,
	connectionId: string = 'default'
): Promise<T> {
	const db = createTestDatabase(connectionId);

	return await db.transaction(async (tx) => {
		const result = await testFn(tx);
		// Transaction will be rolled back automatically if an error occurs
		// For successful tests, you may want to rollback anyway for isolation
		// This depends on your testing strategy
		return result;
	});
}

/**
 * Gets a test user by email
 * Useful for verifying user creation in tests
 */
export async function getTestUserByEmail(
	email: string,
	connectionId: string = 'default'
): Promise<TestUser | null> {
	const db = createTestDatabase(connectionId);
	const users = await db.select().from(authSchema.user).where(eq(authSchema.user.email, email));
	return users[0] || null;
}

/**
 * Gets test organization by slug
 */
export async function getTestOrganizationBySlug(
	slug: string,
	connectionId: string = 'default'
): Promise<TestOrganization | null> {
	const db = createTestDatabase(connectionId);
	const orgs = await db
		.select()
		.from(authSchema.organization)
		.where(eq(authSchema.organization.slug, slug));
	return orgs[0] || null;
}

// Utility functions
function generateId(): string {
	return 'test_' + Math.random().toString(36).substring(2, 15);
}

function generateSessionToken(): string {
	return 'test_token_' + Math.random().toString(36).substring(2, 25);
}

function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 50);
}

// TypeScript types for test data
export interface TestUser {
	id: string;
	email: string;
	name: string | null;
	role: string;
	emailVerified: boolean | null;
	image: string | null;
	banned: boolean | null;
	banReason: string | null;
	banExpiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface TestOrganization {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	metadata: string | null;
	createdAt: Date;
}

export interface TestSession {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	activeOrganizationId: string | null;
}

export interface TestMember {
	id: string;
	organizationId: string;
	userId: string;
	role: string;
	createdAt: Date;
}

export interface TestFixtures {
	users: {
		user1: TestUser;
		user2: TestUser;
		admin: TestUser;
	};
	organization: TestOrganization;
}

/**
 * Creates a minimal test environment for quick unit tests
 * Only creates essential data without full seeding
 */
export async function createMinimalTestEnvironment(connectionId: string = 'default'): Promise<{
	user: TestUser;
	organization: TestOrganization;
}> {
	const user = await createTestUser(
		{
			email: 'minimal-test-user@example.com',
			name: 'Minimal Test User'
		},
		connectionId
	);

	const organization = await createTestOrganization(
		{
			name: 'Minimal Test Org',
			slug: 'minimal-test-org'
		},
		connectionId
	);

	// Make user the owner of the organization
	await createTestMembership(
		{
			organizationId: organization.id,
			userId: user.id,
			role: 'owner'
		},
		connectionId
	);

	return { user, organization };
}
