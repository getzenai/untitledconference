import {
	bigint,
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name'), // Made nullable
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified')
		.$defaultFn(() => false)
		.notNull(),
	image: text('image'),
	role: text('role')
		.$defaultFn(() => 'user')
		.notNull(),
	banned: boolean('banned').$defaultFn(() => false),
	banReason: text('ban_reason'),
	banExpiresAt: timestamp('ban_expires_at'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	activeOrganizationId: text('active_organization_id'),
	impersonatedBy: text('impersonated_by')
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});

export const organization = pgTable('organization', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').unique(),
	logo: text('logo'),
	metadata: text('metadata'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const member = pgTable('member', {
	id: text('id').primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	role: text('role').notNull(),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const invitation = pgTable('invitation', {
	id: text('id').primaryKey(),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	email: text('email').notNull(),
	role: text('role'),
	status: text('status').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	inviterId: text('inviter_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const systemInvitation = pgTable('system_invitation', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	invitedBy: text('invited_by')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	role: text('role')
		.$defaultFn(() => 'user')
		.notNull(),
	resetLink: text('reset_link'),
	lastGeneratedAt: timestamp('last_generated_at'),
	acceptedAt: timestamp('accepted_at'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

// Passkey (WebAuthn) credentials for the @better-auth/passkey plugin.
// Property names must match Better Auth's field names exactly (e.g. credentialID).
export const passkey = pgTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		// WebAuthn signature counters are uint32; int4 would overflow at 2^31
		counter: bigint('counter', { mode: 'number' }).notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		transports: text('transports'),
		aaguid: text('aaguid'),
		createdAt: timestamp('created_at').defaultNow()
	},
	(table) => [
		index('idx_passkey_user_id').on(table.userId),
		// Unique: sign-in resolves the credential (and thus the session user) by
		// credentialID alone, so colliding rows must be impossible
		uniqueIndex('idx_passkey_credential_id').on(table.credentialID)
	]
);

// Key pairs used by the better-auth jwt plugin to sign OAuth access/id tokens
// (public keys served at /api/auth/jwks).
export const jwks = pgTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: timestamp('created_at').notNull(),
	expiresAt: timestamp('expires_at')
});

// OAuth 2.1 provider tables for the @better-auth/oauth-provider plugin.
// Property names must match Better Auth's field names exactly (e.g. requirePKCE).
export const oauthClient = pgTable(
	'oauth_client',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id').notNull().unique(),
		clientSecret: text('client_secret'),
		disabled: boolean('disabled').default(false),
		skipConsent: boolean('skip_consent'),
		enableEndSession: boolean('enable_end_session'),
		subjectType: text('subject_type'),
		scopes: text('scopes').array(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),
		name: text('name'),
		uri: text('uri'),
		icon: text('icon'),
		contacts: text('contacts').array(),
		tos: text('tos'),
		policy: text('policy'),
		softwareId: text('software_id'),
		softwareVersion: text('software_version'),
		softwareStatement: text('software_statement'),
		redirectUris: text('redirect_uris').array().notNull(),
		postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
		tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
		grantTypes: text('grant_types').array(),
		responseTypes: text('response_types').array(),
		public: boolean('public'),
		type: text('type'),
		requirePKCE: boolean('require_pkce'),
		referenceId: text('reference_id'),
		metadata: jsonb('metadata')
	},
	(table) => [index('idx_oauth_client_user_id').on(table.userId)]
);

// Opaque refresh tokens issued with the "offline_access" scope.
export const oauthRefreshToken = pgTable(
	'oauth_refresh_token',
	{
		id: text('id').primaryKey(),
		token: text('token').notNull().unique(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		expiresAt: timestamp('expires_at'),
		createdAt: timestamp('created_at'),
		revoked: timestamp('revoked'),
		authTime: timestamp('auth_time'),
		scopes: text('scopes').array().notNull()
	},
	(table) => [
		index('idx_oauth_refresh_token_client_id').on(table.clientId),
		index('idx_oauth_refresh_token_session_id').on(table.sessionId),
		index('idx_oauth_refresh_token_user_id').on(table.userId)
	]
);

// Opaque access tokens (only issued when no JWT audience applies).
export const oauthAccessToken = pgTable(
	'oauth_access_token',
	{
		id: text('id').primaryKey(),
		token: text('token').unique(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at'),
		createdAt: timestamp('created_at'),
		scopes: text('scopes').array().notNull()
	},
	(table) => [
		index('idx_oauth_access_token_client_id').on(table.clientId),
		index('idx_oauth_access_token_session_id').on(table.sessionId),
		index('idx_oauth_access_token_user_id').on(table.userId),
		index('idx_oauth_access_token_refresh_id').on(table.refreshId)
	]
);

// Remembered per-user consent decisions (skip the consent screen on re-auth).
export const oauthConsent = pgTable(
	'oauth_consent',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		scopes: text('scopes').array().notNull(),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at')
	},
	(table) => [
		index('idx_oauth_consent_client_id').on(table.clientId),
		index('idx_oauth_consent_user_id').on(table.userId)
	]
);
