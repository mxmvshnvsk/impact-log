# Сборка из корня репозитория: docker build -f apps/web/Dockerfile .
# Итоговый образ — Caddy со статикой SPA и конфигом reverse proxy.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@impact-log/web..."
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @impact-log/web build

FROM caddy:2-alpine
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
