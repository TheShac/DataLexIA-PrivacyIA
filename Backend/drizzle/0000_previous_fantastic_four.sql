CREATE TABLE `analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int NOT NULL,
	`requested_by` int NOT NULL,
	`status` enum('pendiente','en_proceso','completado','error') NOT NULL DEFAULT 'pendiente',
	`overall` enum('cumple','no_cumple'),
	`count_high` smallint,
	`count_medium` smallint,
	`count_low` smallint,
	`config` json NOT NULL,
	`error_message` text,
	`started_at` datetime,
	`finished_at` datetime,
	`created_at` datetime,
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finding_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`finding_id` int NOT NULL,
	`reviewer_id` int NOT NULL,
	`decision` enum('aprobado','modificado','rechazado','segunda_revision') NOT NULL,
	`comment` text,
	`changes` json,
	`created_at` datetime,
	CONSTRAINT `finding_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysis_id` int NOT NULL,
	`severity` enum('alto','medio','leve') NOT NULL,
	`location` varchar(100) NOT NULL,
	`page` smallint,
	`start_line` int,
	`end_line` int,
	`fragment` text,
	`quote` text,
	`articles` json NOT NULL,
	`explanation` text NOT NULL,
	`mitigation` text,
	`confidence` decimal(4,3),
	`priority` smallint,
	`status` enum('pendiente','aprobado','modificado','rechazado','segunda_revision') NOT NULL DEFAULT 'pendiente',
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`action` varchar(64) NOT NULL,
	`entity_type` varchar(40),
	`entity_id` varchar(64),
	`details` json,
	`ip` varchar(45),
	`created_at` datetime,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` char(64) NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime,
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(200),
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`conversation_id` int NOT NULL,
	`sender` enum('usuario','asistente') NOT NULL,
	`content` text NOT NULL,
	`sources` json,
	`low_confidence` boolean NOT NULL DEFAULT false,
	`created_at` datetime,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` int NOT NULL,
	`sha256` char(64) NOT NULL,
	`category` varchar(60),
	`version` int NOT NULL DEFAULT 1,
	`previous_version_id` int,
	`status` enum('cargado','procesando','indexado','error','archivado') NOT NULL DEFAULT 'cargado',
	`is_enabled_source` boolean NOT NULL DEFAULT false,
	`valid_from` date,
	`valid_until` date,
	`rag_document_id` int,
	`uploaded_by` int NOT NULL,
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`finding_id` int,
	`message_id` bigint,
	`rating` tinyint,
	`correction` text,
	`comment` text,
	`created_at` datetime,
	CONSTRAINT `ai_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(60) NOT NULL,
	`description` varchar(255) NOT NULL,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` varchar(255),
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(120) NOT NULL,
	`email` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role_id` int NOT NULL,
	`status` enum('activo','desactivado') NOT NULL DEFAULT 'activo',
	`failed_login_attempts` tinyint NOT NULL DEFAULT 0,
	`locked_until` datetime,
	`last_login_at` datetime,
	`password_changed_at` datetime,
	`created_by` int,
	`created_at` datetime,
	`updated_at` datetime,
	`deactivated_at` datetime,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `analyses` ADD CONSTRAINT `analyses_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analyses` ADD CONSTRAINT `analyses_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finding_reviews` ADD CONSTRAINT `finding_reviews_finding_id_findings_id_fk` FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finding_reviews` ADD CONSTRAINT `finding_reviews_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `findings` ADD CONSTRAINT `findings_analysis_id_analyses_id_fk` FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversation_id_chat_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_previous_version_id_documents_id_fk` FOREIGN KEY (`previous_version_id`) REFERENCES `documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_finding_id_findings_id_fk` FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_message_id_chat_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;