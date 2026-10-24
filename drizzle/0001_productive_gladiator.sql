CREATE TABLE `deferred_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
