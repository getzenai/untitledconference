import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth-schema';

export const documentsTable = pgTable('documents', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	// Markdown (CommonMark + GFM) as produced by the Milkdown editor.
	// Rows written before the Milkdown migration still contain ProseMirror JSON —
	// read them through `toMarkdown()` from $lib/server/documents/content-format.
	content: text('content').notNull(),
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
