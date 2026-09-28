-- E2EE / local-first (ADR-0006…0009): сервер хранит только аутентификацию, ключевые конверты,
-- устройства, непрозрачные зашифрованные объекты и тариф. Данных на проде нет — старые таблицы
-- (0000_init, 0001_trusted_devices) удаляются целиком; на пустой базе миграция тоже проходит.
DROP TABLE IF EXISTS "recovery_codes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "trusted_devices" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
CREATE SEQUENCE "public"."object_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_label" text,
	"trust_token_hash" text,
	"trust_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_trust_token_hash_unique" UNIQUE("trust_token_hash")
);
--> statement-breakpoint
CREATE TABLE "key_envelopes" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"envelope" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "key_envelopes_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"user_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"ciphertext" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objects_user_id_object_id_pk" PRIMARY KEY("user_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"kind" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"persistent" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(12) NOT NULL,
	"login" varchar(32) NOT NULL,
	"auth_key_hash" text NOT NULL,
	"kdf_params" jsonb NOT NULL,
	"kdf_salt" text NOT NULL,
	"totp_secret" text NOT NULL,
	"totp_last_step" bigint,
	"totp_pending_secret" text,
	"recovery_auth_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"plan" text DEFAULT 'PILOT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "users_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_envelopes" ADD CONSTRAINT "key_envelopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "objects_user_seq_idx" ON "objects" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_device_id_idx" ON "sessions" USING btree ("device_id");