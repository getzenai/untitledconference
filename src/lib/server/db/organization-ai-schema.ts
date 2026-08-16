import { customType, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth-schema';

/**
 * Postgres `bytea` as `Uint8Array`. drizzle-orm 0.45 has no first-class
 * `bytea` builder; the cipher and IV must not live in a text column.
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType() {
		return 'bytea';
	},
	toDriver(value: Uint8Array): Uint8Array {
		return value;
	},
	fromDriver(value: unknown): Uint8Array {
		if (value instanceof Uint8Array) return value;
		if (typeof value === 'string' && value.startsWith('\\x')) {
			const hex = value.slice(2);
			const bytes = new Uint8Array(hex.length / 2);
			for (let i = 0; i < bytes.length; i++) {
				bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
			}
			return bytes;
		}
		throw new Error('Unsupported bytea driver value');
	}
});

/**
 * One OpenAI-compatible backend per organization. The API key is stored
 * wrapped (AES-256-GCM); the plaintext never leaves the server.
 */
export const organizationAiSettings = pgTable('organization_ai_settings', {
	organizationId: text('organization_id')
		.primaryKey()
		.references(() => organization.id, { onDelete: 'cascade' }),
	baseUrl: text('base_url').notNull(),
	apiKeyCipher: bytea('api_key_cipher').notNull(),
	apiKeyIv: bytea('api_key_iv').notNull(),
	apiKeySuffix: text('api_key_suffix'),
	modelId: text('model_id'),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	updatedBy: text('updated_by')
});

export type OrganizationAiSettings = typeof organizationAiSettings.$inferSelect;
export type NewOrganizationAiSettings = typeof organizationAiSettings.$inferInsert;
