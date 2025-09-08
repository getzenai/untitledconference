import { jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth-schema';

export const documentsTable = pgTable('documents', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	content: jsonb('content').notNull(), // Tiptap JSON content
	plainText: text('plain_text'), // For search and preview
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export type Document = typeof documentsTable.$inferSelect;
export type NewDocument = typeof documentsTable.$inferInsert;
