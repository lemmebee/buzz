CREATE TABLE `product_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE CASCADE,
	`field` text NOT NULL,
	`content` text NOT NULL,
	`text_provider` text,
	`source` text NOT NULL,
	`created_at` integer
);
