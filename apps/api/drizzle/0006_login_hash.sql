-- Логин больше не хранится: только HMAC-SHA256 (hex) под серверным ключом HKDF(TOTP_ENCRYPTION_KEY,
-- 'impact-log/login-hash/v1') — lib/crypto.ts → createLoginHasher. Уже созданные аккаунты переводятся здесь:
-- migrate.ts передаёт тот же ключ (hex) параметром подключения impact_log.login_hash_key. Без ключа миграция
-- проходит только на пустой таблице users. pgcrypto нужен только на время пересчёта и после удаляется,
-- если его не было.
ALTER TABLE "users" ADD COLUMN "login_hash" varchar(64);--> statement-breakpoint
DO $$
DECLARE
  k text := current_setting('impact_log.login_hash_key', true);
  had_pgcrypto boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto');
BEGIN
  IF EXISTS (SELECT 1 FROM "users") THEN
    IF k IS NULL OR k !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'impact_log.login_hash_key is not set: run dist/migrate.js with TOTP_ENCRYPTION_KEY';
    END IF;
    IF NOT had_pgcrypto THEN
      CREATE EXTENSION pgcrypto;
    END IF;
    UPDATE "users"
    SET "login_hash" = encode(hmac(convert_to("login", 'UTF8'), decode(k, 'hex'), 'sha256'), 'hex');
    IF NOT had_pgcrypto THEN
      DROP EXTENSION pgcrypto;
    END IF;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "login_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_login_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "login";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_hash_unique" UNIQUE("login_hash");
