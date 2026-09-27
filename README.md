# impact-log

impact log — записывайте, что сделали и к чему это привело, — и получайте выжимку к перфоманс-ревью.

## Структура

```
apps/web         — фронтенд: Vue 3 + Vite + vue-router + vue-i18n
apps/api         — бэкенд: Fastify 5 + Drizzle ORM
packages/shared  — общие zod-схемы, типы, коды ошибок
infra/caddy      — Caddyfile (reverse proxy + раздача SPA)
docs/adr         — архитектурные решения
```

## Локальная разработка

Нужны Node 24 (`.nvmrc`), pnpm (`corepack enable`) и Docker.

```bash
pnpm install
pnpm db:up        # Postgres в Docker на localhost:5432
pnpm dev          # api → http://localhost:3000, web → http://localhost:5173
```

Проверки (то же самое запускает CI):

```bash
pnpm check        # Biome: линт + формат (pnpm format — автоисправление)
pnpm typecheck
pnpm build
```

## Деплой

Push в `main` → GitHub Actions: проверки → сборка образов в GHCR → обновление на сервере.
Подготовка сервера и ручные операции — [docs/deploy.md](docs/deploy.md).
