import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../auth-schema';

export const exampleObjectsTable = pgTable('example_objects', {
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

export type ExampleObject = typeof exampleObjectsTable.$inferSelect;
export type NewExampleObject = typeof exampleObjectsTable.$inferInsert;
