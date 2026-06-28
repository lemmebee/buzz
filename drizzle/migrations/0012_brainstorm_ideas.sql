CREATE TABLE `brainstorm_ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`hook` text NOT NULL,
	`why_it_works` text,
	`format` text,
	`riskiest_assumption` text,
	`novelty_score` integer,
	`fit_score` integer,
	`feasibility_score` integer,
	`theme` text,
	`created_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
