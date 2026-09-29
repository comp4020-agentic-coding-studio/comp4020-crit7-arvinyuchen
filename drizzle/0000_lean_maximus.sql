CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activities_mode" CHECK("activities"."mode" in ('all', 'pick'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_course_name` ON `activities` (`course_id`,`name`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `picks` (
	`activity_id` integer PRIMARY KEY NOT NULL,
	`session_id` integer NOT NULL,
	`picked_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`label` text NOT NULL,
	`day` integer NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`room` text NOT NULL,
	`capacity` integer,
	`taken` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_day" CHECK("sessions"."day" between 1 and 7),
	CONSTRAINT "sessions_time" CHECK("sessions"."start" < "sessions"."end")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_activity_label` ON `sessions` (`activity_id`,`label`);