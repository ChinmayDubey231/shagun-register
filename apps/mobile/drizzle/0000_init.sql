CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer,
	`event_id` text NOT NULL,
	`counted_amount` integer NOT NULL,
	`counted_by` text NOT NULL,
	`counted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_counts_event_idx` ON `cash_counts` (`family_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`mode` text NOT NULL,
	`item_note` text,
	`sub_function` text,
	`note` text,
	`photo_key` text,
	`created_by` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_family_person_idx` ON `entries` (`family_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `entries_family_event_idx` ON `entries` (`family_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `entries_family_seq_idx` ON `entries` (`family_id`,`seq`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`role` text NOT NULL,
	`host_person_id` text,
	`date` text NOT NULL,
	`sub_functions` text DEFAULT '[]' NOT NULL,
	`venue` text
);
--> statement-breakpoint
CREATE INDEX `events_family_date_idx` ON `events` (`family_id`,`date`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `outbox_record_idx` ON `outbox` (`record_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`seq` integer,
	`display_name` text NOT NULL,
	`name_latin` text NOT NULL,
	`name_devanagari` text,
	`relation` text,
	`city` text,
	`phone` text,
	`merged_into` text
);
--> statement-breakpoint
CREATE INDEX `people_family_name_idx` ON `people` (`family_id`,`name_latin`);--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`family_id` text PRIMARY KEY NOT NULL,
	`family_name` text NOT NULL,
	`last_pulled_seq` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer
);
