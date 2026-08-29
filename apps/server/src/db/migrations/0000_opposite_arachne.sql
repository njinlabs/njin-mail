CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`part_id` text NOT NULL,
	`filename` text,
	`content_type` text,
	`size` integer,
	`content_id` text,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`delimiter` text,
	`special_use` text,
	`uid_validity` integer,
	`uid_next` integer,
	`highest_modseq` integer,
	`last_synced_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_user_name_unique` ON `folders` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`uid` integer NOT NULL,
	`message_id` text,
	`in_reply_to` text,
	`references_hdr` text,
	`subject` text,
	`from_addr` text,
	`to_addr` text,
	`cc_addr` text,
	`bcc_addr` text,
	`date` text,
	`internal_date` text,
	`flags` text,
	`has_attachments` integer DEFAULT 0 NOT NULL,
	`size` integer,
	`snippet` text,
	`body_text` text,
	`body_html` text,
	`body_fetched_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_folder_uid_unique` ON `messages` (`folder_id`,`uid`);--> statement-breakpoint
CREATE INDEX `messages_folder_date_idx` ON `messages` (`folder_id`,`date`);--> statement-breakpoint
CREATE INDEX `messages_message_id_idx` ON `messages` (`message_id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`last_uid_synced` integer DEFAULT 0 NOT NULL,
	`is_syncing` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`tenant_domain` text NOT NULL,
	`display_name` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);