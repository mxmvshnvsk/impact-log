-- Ротация Master Key (ADR-0012): эпоха ключа у аккаунта и у каждого объекта (существующие данные — эпоха 1),
-- идущая ротация (конверты нового MK до commit) и её черновик (перешифрованные объекты). Данные не переносятся.
CREATE TABLE "key_rotations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"target_epoch" integer NOT NULL,
	"device_id" uuid NOT NULL,
	"password_envelope" text NOT NULL,
	"recovery_envelope" text NOT NULL,
	"recovery_auth_hash" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotation_objects" (
	"user_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"staged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_objects_user_id_object_id_pk" PRIMARY KEY("user_id","object_id")
);
--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "key_epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "key_epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "key_rotations" ADD CONSTRAINT "key_rotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_rotations" ADD CONSTRAINT "key_rotations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_objects" ADD CONSTRAINT "rotation_objects_user_id_key_rotations_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."key_rotations"("user_id") ON DELETE cascade ON UPDATE no action;