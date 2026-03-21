CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_entity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`entity_id` text NOT NULL,
	`name` text,
	`name_raw` text,
	`type` integer,
	`device_class` integer,
	`unit` text,
	`attributes_json` text,
	`restore_mode` integer DEFAULT 0,
	`disabled` integer DEFAULT 0,
	`deleted_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_entity_device_entity_id_unique` ON `device_entity` (`device_id`,`entity_id`);--> statement-breakpoint
CREATE TABLE `device_entity_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`state` integer,
	`brightness` integer,
	`mode` integer,
	`rgb_json` text,
	`color_temp` integer,
	`value_real` real,
	`deleted_at` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_entity_state_entity_id_unique` ON `device_entity_state` (`entity_id`);--> statement-breakpoint
CREATE TABLE `device_entity_state_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`state` integer,
	`brightness` integer,
	`mode` integer,
	`rgb_json` text,
	`color_temp` integer,
	`value_real` real,
	`recorded_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `device_health_br` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`free_heap` integer,
	`minimum_free_heap` integer,
	`uptime` integer,
	`stack_hwm` text,
	`mle_detach_count` integer,
	`recorded_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_health_br_device_id_unique` ON `device_health_br` (`device_id`);--> statement-breakpoint
CREATE TABLE `device_info` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mac_address` text NOT NULL,
	`device_slug` text,
	`device_name` text,
	`device_name_raw` text,
	`device_type` integer,
	`is_border_router` integer DEFAULT 0,
	`manufactureri` text,
	`model` text,
	`sw_version` integer,
	`hw_version` integer,
	`hop` integer DEFAULT 0,
	`last_seen_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_info_mac_address_unique` ON `device_info` (`mac_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_info_device_slug_unique` ON `device_info` (`device_slug`);--> statement-breakpoint
CREATE TABLE `device_topology` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`rloc16` integer,
	`parent_rloc16` integer,
	`role` integer,
	`rssi` integer,
	`link_quality` integer,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_topology_device_id_unique` ON `device_topology` (`device_id`);--> statement-breakpoint
CREATE TABLE `device_topology_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`rloc16` integer,
	`parent_rloc16` integer,
	`role` integer,
	`rssi` integer,
	`link_quality` integer,
	`recorded_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `device_topology_neighbor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`neighbor_rloc16` integer NOT NULL,
	`rssi` integer,
	`lq_in` integer,
	`lq_out` integer,
	`is_child` integer DEFAULT 0,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_topology_neighbor_device_neighbor_unique` ON `device_topology_neighbor` (`device_id`,`neighbor_rloc16`);