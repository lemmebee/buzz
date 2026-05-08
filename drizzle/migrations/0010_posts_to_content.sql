-- Rename posts → content; introduce mediaType / targetSurface axes; add video columns.

ALTER TABLE `posts` RENAME TO `content`;
ALTER TABLE `content` RENAME COLUMN `type` TO `target_surface`;
ALTER TABLE `content` ADD COLUMN `media_type` text NOT NULL DEFAULT 'image';
ALTER TABLE `content` ADD COLUMN `script` text;
ALTER TABLE `content` ADD COLUMN `duration` integer;
ALTER TABLE `content` ADD COLUMN `audio_url` text;
ALTER TABLE `content` ADD COLUMN `captions_url` text;
ALTER TABLE `content` ADD COLUMN `config` text;

ALTER TABLE `generation_schedules` RENAME COLUMN `content_type` TO `target_surface`;
ALTER TABLE `generation_schedules` ADD COLUMN `media_type` text NOT NULL DEFAULT 'image';
ALTER TABLE `generation_schedules` ADD COLUMN `config` text;
