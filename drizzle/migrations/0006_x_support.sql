CREATE TABLE `x_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`x_user_id` text NOT NULL,
	`username` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`token_expires_at` integer,
	`created_at` integer
);
--> statement-breakpoint
ALTER TABLE `products` ADD `x_account_id` integer REFERENCES x_accounts(id);
--> statement-breakpoint
ALTER TABLE `posts` ADD `platform` text DEFAULT 'instagram' NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD `x_post_id` text;
--> statement-breakpoint
UPDATE `posts` SET `platform` = 'instagram' WHERE `platform` IS NULL;
