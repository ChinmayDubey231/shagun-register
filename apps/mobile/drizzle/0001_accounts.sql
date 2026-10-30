ALTER TABLE `sync_meta` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `sync_meta` ADD `role` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_meta` ADD `registered_at` integer;