# Деплой

Схема: push в `main` → `.github/workflows/deploy.yml`:
1. `check` — Biome, typecheck, тесты `@impact-log/core`, сборка;
2. `images` — Docker-образы `impact-log-api` и `impact-log-web` (Caddy + статика) → `ghcr.io/<owner>/…`,
   теги `<git sha>` и `latest`;
3. `deploy` — по SSH на сервер: `git pull --ff-only`, `docker compose pull`, `docker compose up -d --remove-orphans`.
   Перед стартом api одноразовый сервис `migrate` применяет миграции БД (`node dist/migrate.js`).

Сервисы (`docker-compose.yml`): `caddy` (образ `impact-log-web`: TLS, SPA, прокси `/api`), `api`, `migrate`,
`db` (PostgreSQL 17). Наружу опубликован только Caddy (80, 443, 443/udp); api и db — во внутренних сетях,
db — в сети `backend` без выхода наружу.

## Первичная подготовка сервера (один раз)

Все команды — на сервере, в каталоге клона репозитория.

### 1. Доступ к приватным образам GHCR
Репозиторий приватный, поэтому образы тоже приватные.

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** →
   Generate new token (classic). Scope — **только `read:packages`**, срок — например, 1 год.
2. На сервере:
   ```bash
   echo "<токен>" | docker login ghcr.io -u <github-логин> --password-stdin
   ```

### 2. Файл окружения
```bash
cd /opt/impact-log
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
nano .env        # GHCR_OWNER=<github-логин в нижнем регистре>, остальное можно оставить
chmod 600 .env
```

### 3. Серверный секрет
```bash
cd /opt/impact-log
sed -i "s/^TOTP_ENCRYPTION_KEY=.*/TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
```
Из этого секрета HKDF выводит (разными метками) ключ шифрования TOTP-секретов (`impact-log/v1/totp-secret`)
и ключ «фальшивой» соли prelogin для несуществующих логинов (`impact-log/prelogin-salt/v1`).
**Не меняйте его после появления пользователей** — иначе их 2FA перестанет работать. Сохраните копию ключа
в менеджере паролей: без него бэкап базы бесполезен для входа.

### 4. Первый деплой
Сделать push в `main` (или GitHub → Actions → CI / Deploy → Run workflow).
Проверить:
```bash
docker compose ps
curl -s https://impact-log.com/api/health
```

## Переменные окружения

Файл `/opt/impact-log/.env` (шаблон — `.env.example`) читает `docker-compose.yml` и передаёт в сервисы.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DOMAIN` | — | Домен, для которого Caddy получает TLS-сертификат (`impact-log.com`) |
| `GHCR_OWNER`, `IMAGE_TAG` | —, `latest` | Откуда брать образы: `ghcr.io/<owner>/impact-log-api\|web:<tag>` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | — | БД; из них compose собирает `DATABASE_URL` для `api` и `migrate`. Пароль — только URL-безопасные символы |
| `TOTP_ENCRYPTION_KEY` | — (обязательна) | Серверный секрет, 32 байта hex (§3 выше). Без неё compose не стартует |
| `REGISTRATION_ENABLED` | `true` | `false` закрывает регистрацию новых пользователей |
| `REGION` | `ru-1` | Регион инстанса — отдаётся клиентам в `POST /api/region/resolve` (ADR-0011) |
| `PUBLIC_API_BASE_URL` | `/api` | Базовый URL API для клиентов этого региона: путь от origin или абсолютный URL |
| `SYNC_RATE_LIMIT_MAX` | `120` | Запросов `/api/sync/*` в минуту на пользователя (ADR-0007) |

Заданы в образе api и в `.env` не нужны: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`,
`TRUST_PROXY=true` (api доверяет `X-Forwarded-For` от Caddy — поэтому api нельзя публиковать наружу
напрямую: клиент подделал бы IP и обошёл лимиты частоты), `APP_VERSION` (sha коммита). Полный список
переменных api — [docs/api.md](api.md).

## Миграции БД

Применяются автоматически сервисом `migrate` при каждом `docker compose up -d`; вручную:
`docker compose run --rm migrate`.

| Миграция | Что делает |
| --- | --- |
| `0000_init`, `0001_trusted_devices` | Схема модели ADR-0001 (исторические) |
| `0002_e2ee` | **Удаляет** старые таблицы (`users`, `sessions`, `recovery_codes`, `trusted_devices`) со всеми данными и создаёт схему local-first + E2EE: `users`, `key_envelopes`, `devices`, `sessions`, `objects`, последовательность `object_seq`. Проходит и поверх 0000–0001, и на пустой базе |
| `0003_hardening` | Добавляет `devices.secret_hash`, `sessions.via_recovery`, `users.totp_failed_count`, `users.totp_locked_until` |

**TOTP-секреты — формат v2** (`v2:` + AES-256-GCM, ключ из HKDF, AAD = id пользователя): секреты старого
формата сервер не читает, и такие аккаунты не смогут войти — их нужно создать заново. На проде аккаунтов,
созданных до `0003_hardening`, нет, так что действий не требуется. Устройства, созданные до 0003 (без
`secret_hash`), при следующем входе просто заменятся новыми.

## Caddy: заголовки и кеширование

Конфиг — `infra/caddy/Caddyfile`, вшит в образ `impact-log-web`.

- **CSP:** `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. `'wasm-unsafe-eval'` разрешает только
  компиляцию WebAssembly (Argon2id, `hash-wasm`) — не `eval`; `worker-src 'self'` — Web Worker вывода ключей
  и service worker PWA.
- Плюс HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` без камеры, микрофона и геолокации; заголовок `Server` убран.
- **Кеширование:** `/assets/*` — `public, max-age=31536000, immutable`; `index.html` (и всё, что отдаётся
  вместо неизвестных путей SPA), `/sw.js` и `/manifest.webmanifest` — `no-cache`, иначе новая версия PWA
  может «застрять» в HTTP-кеше; манифест — `Content-Type: application/manifest+json` ([docs/pwa.md](pwa.md)).
- Sourcemaps (`*.map`) есть в образе, но наружу не отдаются (404).
- Логи доступа: IP усечены (IPv4 /24, IPv6 /48), заголовки запросов и ответов не пишутся.

Аварийно выключить PWA у всех пользователей — нельзя просто удалить `sw.js`, нужен «самоудаляющийся»
service worker: инструкция в [docs/pwa.md](pwa.md), раздел «Как сбросить».

## Операции

```bash
cd /opt/impact-log
docker compose ps                         # состояние сервисов
docker compose logs -f api                # логи api (caddy, db — аналогично)
IMAGE_TAG=<sha> docker compose up -d      # откат на конкретную версию (sha коммита)
docker compose exec db psql -U impact impact   # консоль БД
```

Откат образа не откатывает миграции БД: версия до `0002_e2ee` с новой схемой не работает.

Логи контейнеров ротируются Docker'ом: до 5 файлов по 10 МБ на сервис. В логах api нет тел запросов,
cookie, полных IP и параметров SQL (ошибки БД пишутся без текста запроса и значений).
