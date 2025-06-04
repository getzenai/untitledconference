import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const dummyElementsTable = pgTable('dummy_elements', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export type DummyElement = typeof dummyElementsTable.$inferSelect;
export type NewDummyElement = typeof dummyElementsTable.$inferInsert;
