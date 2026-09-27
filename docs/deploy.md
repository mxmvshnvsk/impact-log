# Деплой

Схема: push в `main` → `.github/workflows/deploy.yml`:
1. `check` — Biome, typecheck, сборка;
2. `images` — Docker-образы `impact-log-api` и `impact-log-web` (Caddy + статика) → `ghcr.io/<owner>/…`,
   теги `<git sha>` и `latest`;
3. `deploy` — по SSH на сервер: `git pull`, `docker compose pull`, `docker compose up -d`.
   Перед стартом api одноразовый сервис `migrate` применяет миграции БД.

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

### 3. Первый деплой
Сделать push в `main` (или GitHub → Actions → CI / Deploy → Run workflow).
Проверить:
```bash
docker compose ps
curl -s https://impact-log.com/api/health
```

## Операции

```bash
cd /opt/impact-log
docker compose ps                         # состояние сервисов
docker compose logs -f api                # логи api (caddy, db — аналогично)
IMAGE_TAG=<sha> docker compose up -d      # откат на конкретную версию (sha коммита)
docker compose exec db psql -U impact impact   # консоль БД
```

Логи контейнеров ротируются Docker'ом: до 5 файлов по 10 МБ на сервис.
