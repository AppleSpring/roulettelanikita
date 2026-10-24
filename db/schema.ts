import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const sharedSettings = sqliteTable('shared_settings', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull()
});
export const deferredTasks = sqliteTable('deferred_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  kind: text('kind').notNull(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at')
});
