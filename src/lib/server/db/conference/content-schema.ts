/**
 * Speaker tasks, uploaded deliverables, file comments and content history.
 *
 * Implements section 7 of DATA_MODEL.md (kill-my-saas-ux @ adba9f7).
 * This is the collection loop, not a document library.
 */
import { relations } from 'drizzle-orm';
import {
	index,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from '../auth-schema';
import { submissionTable } from './cfp-schema';
import { conferenceTable, speakerProfileTable } from './conference-schema';

/** `file_request` expects an upload (CNT-01/02); `action` is a plain to-do (SPK-05/09). */
export const taskKind = pgEnum('task_kind', ['action', 'file_request']);

export const taskStatus = pgEnum('task_status', ['open', 'submitted', 'done']);

/** Per-file approval. The programme gate is `submission.content_approval`, not this. */
export const deliverableApproval = pgEnum('deliverable_approval', [
	'pending',
	'approved',
	'rejected'
]);

/** What a content revision describes. Polymorphic — see contentRevisionTable. */
export const revisionEntity = pgEnum('revision_entity', ['submission', 'speaker_profile']);

/**
 * A reusable task definition. Tasks are generated from these on acceptance:
 * `dueOffsetDays` is relative to the acceptance date, `dueOn` is absolute.
 */
export const taskTemplateTable = pgTable('task_template', {
	id: serial('id').primaryKey(),
	conferenceId: integer('conference_id')
		.notNull()
		.references(() => conferenceTable.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	instructions: text('instructions'),
	kind: taskKind('kind').notNull().default('action'),
	dueOffsetDays: integer('due_offset_days'),
	dueOn: timestamp('due_on', { withTimezone: true }),
	position: integer('position').notNull().default(0)
});

export const taskTable = pgTable(
	'task',
	{
		id: serial('id').primaryKey(),
		conferenceId: integer('conference_id')
			.notNull()
			.references(() => conferenceTable.id, { onDelete: 'cascade' }),
		speakerProfileId: integer('speaker_profile_id')
			.notNull()
			.references(() => speakerProfileTable.id, { onDelete: 'cascade' }),
		/** Set when the task belongs to one talk rather than the speaker in general. */
		submissionId: integer('submission_id').references(() => submissionTable.id, {
			onDelete: 'cascade'
		}),
		templateId: integer('template_id').references(() => taskTemplateTable.id, {
			onDelete: 'set null'
		}),
		title: text('title').notNull(),
		instructions: text('instructions'),
		kind: taskKind('kind').notNull().default('action'),
		dueOn: timestamp('due_on', { withTimezone: true }),
		status: taskStatus('status').notNull().default('open'),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		/** The deliverables dashboard (CNT-07) and the speaker's own portal (CNT-02). */
		index('task_speaker_idx').on(t.speakerProfileId, t.status),
		index('task_conference_due_idx').on(t.conferenceId, t.dueOn)
	]
);

/**
 * One row per uploaded version. CNT-04 wants a re-upload to create a NEW version with
 * the latest clearly marked and earlier ones still reachable — so versions are rows,
 * never an overwrite. "Latest" is `max(version)` per task.
 */
export const deliverableTable = pgTable(
	'deliverable',
	{
		id: serial('id').primaryKey(),
		taskId: integer('task_id')
			.notNull()
			.references(() => taskTable.id, { onDelete: 'cascade' }),
		fileUrl: text('file_url').notNull(),
		filename: text('filename').notNull(),
		contentType: text('content_type'),
		sizeBytes: integer('size_bytes'),
		version: integer('version').notNull().default(1),
		approvalStatus: deliverableApproval('approval_status').notNull().default('pending'),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('deliverable_version_unique').on(t.taskId, t.version)]
);

/**
 * CNT-05: comments on an uploaded file, with author and timestamp, visible ACROSS
 * ROLES. That last part is what separates this from `review.comment`, which a speaker
 * must never see.
 */
export const fileCommentTable = pgTable(
	'file_comment',
	{
		id: serial('id').primaryKey(),
		deliverableId: integer('deliverable_id')
			.notNull()
			.references(() => deliverableTable.id, { onDelete: 'cascade' }),
		authorUserId: text('author_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('file_comment_deliverable_idx').on(t.deliverableId, t.createdAt)]
);

/**
 * CNT-11: a snapshot per edit of a title, abstract or bio, with author and timestamp,
 * from which an earlier version can be restored.
 *
 * `entityId` is polymorphic and deliberately carries NO foreign key. That is not an
 * oversight: a history that dies with the thing it describes is not a history.
 */
export const contentRevisionTable = pgTable(
	'content_revision',
	{
		id: serial('id').primaryKey(),
		entityType: revisionEntity('entity_type').notNull(),
		entityId: integer('entity_id').notNull(),
		/** JSON snapshot of the edited fields, as they were BEFORE this edit. */
		snapshot: text('snapshot').notNull(),
		editedBy: text('edited_by').references(() => user.id, { onDelete: 'set null' }),
		editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('content_revision_entity_idx').on(t.entityType, t.entityId, t.editedAt)]
);

export const taskRelations = relations(taskTable, ({ one, many }) => ({
	speakerProfile: one(speakerProfileTable, {
		fields: [taskTable.speakerProfileId],
		references: [speakerProfileTable.id]
	}),
	submission: one(submissionTable, {
		fields: [taskTable.submissionId],
		references: [submissionTable.id]
	}),
	deliverables: many(deliverableTable)
}));

export const deliverableRelations = relations(deliverableTable, ({ one, many }) => ({
	task: one(taskTable, { fields: [deliverableTable.taskId], references: [taskTable.id] }),
	comments: many(fileCommentTable)
}));

export type TaskTemplate = typeof taskTemplateTable.$inferSelect;
export type NewTaskTemplate = typeof taskTemplateTable.$inferInsert;
export type Task = typeof taskTable.$inferSelect;
export type NewTask = typeof taskTable.$inferInsert;
export type Deliverable = typeof deliverableTable.$inferSelect;
export type NewDeliverable = typeof deliverableTable.$inferInsert;
export type FileComment = typeof fileCommentTable.$inferSelect;
export type NewFileComment = typeof fileCommentTable.$inferInsert;
export type ContentRevision = typeof contentRevisionTable.$inferSelect;
export type NewContentRevision = typeof contentRevisionTable.$inferInsert;
