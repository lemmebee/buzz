CREATE TABLE `content_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer NOT NULL REFERENCES `content`(`id`) ON DELETE CASCADE,
	`field` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer
);
