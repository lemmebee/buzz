CREATE TABLE `generation_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE CASCADE,
	`platform` text NOT NULL,
	`content_type` text NOT NULL,
	`count` integer NOT NULL DEFAULT 1,
	`frequency_hours` integer NOT NULL DEFAULT 24,
	`preferred_time` text NOT NULL DEFAULT '09:00',
	`enabled` integer NOT NULL DEFAULT 1,
	`last_run_at` integer,
	`created_at` integer
);

ALTER TABLE `posts` ADD COLUMN `telegram_message_id` text;
