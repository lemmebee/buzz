CREATE TABLE `instagram_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instagram_user_id` text,
	`username` text,
	`access_token` text NOT NULL,
	`token_expires_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`hashtags` text,
	`media_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`posted_at` integer,
	`instagram_id` text,
	`created_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`url` text,
	`features` text,
	`audience` text,
	`tone` text,
	`themes` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);