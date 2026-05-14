-- S0.1: augment products with ICP, JTBD, channel hints, landing URL, attribution secret
ALTER TABLE `products` ADD `icp` text;--> statement-breakpoint
ALTER TABLE `products` ADD `jtbd` text;--> statement-breakpoint
ALTER TABLE `products` ADD `channel_hints` text;--> statement-breakpoint
ALTER TABLE `products` ADD `landing_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `attribution_webhook_secret` text;--> statement-breakpoint
-- Backfill existing rows with random webhook secrets (hex 64 chars from 32-byte randomblob)
UPDATE `products` SET `attribution_webhook_secret` = lower(hex(randomblob(32))) WHERE `attribution_webhook_secret` IS NULL;
