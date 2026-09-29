# impact-log

Личный сервис для ведения impact log: пользователь записывает, что сделал и какой результат получил,
а к перфоманс-ревью / грейдированию получает выжимку достижений и артефактов за период.

## Роли в проекте
- Владелец (Максим): архитектура, постановка бизнес-задач, ревью.
- Claude: весь код, тесты, миграции, инфраструктура (Docker, CI), документация.
- Архитектурные решения фиксируются в `docs/adr/NNNN-*.md`. Перед изменением, противоречащим ADR, — спросить владельца.

## Архитектура (ADR-0005…0012, обзор — docs/architecture.md)
- **Local-first + E2EE.** Приложение работает без регистрации: записи живут в IndexedDB браузера и шифруются
  на устройстве (Master Key → per-object DEK, AES-256-GCM). Аккаунт нужен только для синхронизации.
- **Сервер никогда не видит** пароль, Master Key, Recovery Key и содержимое записей. Он хранит: логин, хеш authKey,
  соль/параметры KDF, зашифрованные конверты MK, зашифрованный TOTP-секрет, непрозрачные зашифрованные объекты
  (версии, tombstone'ы), устройства с зашифрованными названиями, тариф.
- Аутентификация (ADR-0008): prelogin → Argon2id на клиенте → authKey (вместо пароля) + обязательная TOTP 2FA;
  Recovery Key (ILRK1-…) + второй фактор (код 2FA или пароль), без второго фактора — через 48 часов с предупреждением
  на вошедших устройствах; «Запомнить этот компьютер».
- Синхронизация (ADR-0007): push/pull по objectId + baseVersion, конфликты без потерь, заголовок `X-Impact-Account`.
- Ротация Master Key (ADR-0012): эпохи ключа, перешифровка всех объектов через черновик на сервере и атомарный commit;
  другие устройства входят заново и молча перешифровывают локальное хранилище.
- Entitlements (ADR-0009): тарифы PILOT/FREE/PRO — данные в `packages/shared/src/entitlements.ts`, код проверяет
  только `profile.limits` / capabilities, никаких `if (plan === …)`. Безопасность, экспорт и доступ к своим данным
  за пейвол не прячем никогда. Квоты применяет сервер при синхронизации.
- Быстрый захват (ADR-0010): Chrome/CLI/VS Code собирают `ImpactDraft` и открывают `/capture#draft=…` —
  черновик во фрагменте ссылки, в API они не ходят.
- Web — PWA (docs/pwa.md): service worker кеширует только файлы приложения, `/api` не трогает.

## Аудитория и принципы
- Для разработчиков и технически грамотных пользователей, пилот — для себя.
- Приватность и безопасность важнее удобства. Минимум данных о пользователе:
  никакой почты, телефона, реального имени, внешней аналитики и телеметрии.
- Данные принадлежат пользователю: полный экспорт (JSON/CSV/Markdown) и полное удаление аккаунта.

## Стек (см. ADR-0002)
- Монорепо pnpm:
  - `packages/core` — домен (Impact, Evidence, Metric, ImpactDraft), аналитика, отчёт для ревью, экспорт,
    и `@impact-log/core/crypto` — ВСЯ криптография (WebCrypto + hash-wasm). Чистый TS, работает в браузере и Node.
  - `packages/shared` — HTTP-контракты (zod), коды ошибок, entitlements. API зависит только от shared.
  - `apps/api` — Fastify 5 + Drizzle + Postgres. `apps/web` — Vue 3 + Vite + vue-router + vue-i18n + zod + idb.
  - `apps/cli` (`impact`), `apps/chrome-extension` (MV3), `apps/vscode-extension` — клиенты захвата.
- Дизайн-система — ADR-0004 и `docs/design-system.md` (токены, компоненты `src/ui`, правила форм, маскот).
- PostgreSQL 17, Node 24, TypeScript strict, Biome.

## Команды
- `pnpm install` — зависимости. `pnpm db:up` — локальный Postgres в Docker. `pnpm dev` — api (:3000) и web (:5173).
- `pnpm check` (Biome), `pnpm typecheck`, `pnpm build` — всё монорепо.
- `pnpm --filter @impact-log/core test` — тесты ядра (vitest; криптография с замороженными тест-векторами).
- `pnpm --filter @impact-log/api e2e` — e2e API (нужен запущенный API с `TRUST_PROXY=true` на :3000 и чистая БД).
- `cd apps/web && ../api/node_modules/.bin/tsx scripts/sync-e2e.ts` — движок синхронизации против живого API
  (переменные `API_URL`, `DATABASE_URL`).
- `pnpm --filter @impact-log/api db:generate` — миграция после изменения схемы; `db:migrate` — применить.

## Соглашения по коду
- **Frontend — декомпозиция для ревью** (подробно в ADR-0002): компонент = папка
  `X.vue` (template + тонкий script setup) + `useX.ts` (логика) + `X.css` (стили) + `index.ts`.
  Не-Vue код — в `src/utils`, запросы — в `src/api`, общие composables — в `src/composables`.
- Слои web: `src/vault` (IndexedDB, MK в памяти, ключ устройства, зашифрованный репозиторий) → `src/sync` (движок,
  без Vue) → composables → экраны. Экраны берут записи ТОЛЬКО из `useImpacts()`.
- Pinia не используем. Глобальное состояние — синглтоны модулей: `useVault`, `useImpacts`, `useEntitlements`,
  `useSession`, `useAccount`, `useSync`. Если понадобится что-то сверх — обсудить с владельцем.
- **Криптография — только через `@impact-log/core/crypto`**, новые примитивы — только с тестами и тест-векторами.
  Никаких секретов (MK, KEK, authKey, пароль, Recovery Key) в localStorage/sessionStorage/логах/URL.
  localStorage — только настройки (тема, язык, вид отчёта).
- `v-html` — только через `components/MarkdownView` (marked + DOMPurify, сырой HTML экранируется).
- UI собирается из примитивов `src/ui/Ui*`; стили — только через токены `styles/tokens.css`.
- Две темы (светлая/тёмная, ADR-0004): цвета только из токенов, каждый экран проверять в обеих темах.
- Маскот — ретро-монитор с глазами (`components/AppMascot`), управляется через `useMascot`.
- Формы — `useZodForm` + схемы из `packages/shared`/`packages/core`, правила — docs/design-system.md, «Формы».
- Страница «Принципы» (`views/PrinciplesView`, i18n `principles.*`) — публичное описание того, что и как
  мы храним. **Любое изменение в хранении/обработке данных должно сразу отражаться там.**
- **Адаптивность** (ADR-0003): mobile-first; mobile < 720 ≤ tablet < 1200 ≤ desktop. Каркас 1200px (`.l-container`),
  текст 720px (`.l-content`). В CSS — только именованные `@media (--tablet)` / `(--desktop)`, не числа.
  `useBreakpoint()` — только если на разных экранах разные компоненты. Проверять вёрстку на 375 / 720 / 1200.
- Все строки UI — через vue-i18n (`ru` и `en`, оба языка заполнять сразу). Словари: общий
  `src/i18n/locales/<locale>.json` + пространства имён `src/i18n/locales/<locale>/<ns>.json` (ключи `<ns>.*`).
- **Название продукта «impact log» никогда не переводится** — ни в UI, ни в текстах о продукте, ни в каком языке:
  «ваш impact log», «в impact log», «impact log поможет…» (не «лог влияния»). Пишется строчными,
  с заглавной — только в начале предложения («Impact log»). Имя бренда/домена — `impact-log`.
- API отдаёт коды ошибок (`packages/shared/src/errors.ts`), тексты — только на фронте (i18n `errors.*`).
- Входные данные API валидируются zod-схемами из `packages/shared`; контракты меняем в shared, потом в api/web.
- Тесты: до альфы UI-тесты не пишем (решение владельца); но криптография ядра покрыта vitest, а API и синхронизация —
  e2e-скриптами. Lint + typecheck обязательны.
- Перед передачей изменений владельцу Claude всегда прогоняет `pnpm check && pnpm typecheck && pnpm build`
  (+ core-тесты; при изменениях api/sync — e2e).
- Секреты — только через переменные окружения / `.env` (в `.gitignore`), никогда в репозиторий.
- Логи: IP только в усечённом виде; тела запросов и SQL-параметры не логируются.
- Коммиты — Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …).

## Инфраструктура
- Репозиторий **публичный** (лицензия AGPL-3.0): никаких секретов, адресов серверов, логинов и деталей доступа
  в коде, коммитах и документах. Локальные заметки об инфраструктуре — `.private/` (в `.gitignore`), если есть.
- Прод — один VPS с Docker Compose ([docs/deploy.md](docs/deploy.md)). Наружу публикуется только Caddy
  (TLS, SPA, прокси `/api`); api и БД — только во внутренних docker-сетях (Docker обходит ufw!).
- Деплой (`.github/workflows/deploy.yml`): push в `main` → проверки → образы api и web в GHCR → обновление
  на сервере по SSH. Миграции БД применяет одноразовый сервис `migrate` перед стартом api.
- Релиз расширения Chrome (`.github/workflows/chrome-extension.yml`): тег `chrome-v<версия>` → zip → Chrome Web
  Store API v2 (загрузка и отправка на проверку), доступ через Workload Identity Federation —
  `apps/chrome-extension/README.md`.
- Релиз расширения VS Code (`.github/workflows/vscode-extension.yml`): тег `vscode-v<версия>` → VSIX → VS Code
  Marketplace (Microsoft Entra ID, без PAT) и Open VSX (токен); что нужно настроить — в шапке workflow.
- Релиз CLI (`.github/workflows/cli.yml`): тег `cli-v<версия>` → пакет `impact-log` в npm (trusted publishing,
  без токенов); что нужно настроить — в шапке workflow.
- Секреты: прод — `.env` на сервере (шаблон `.env.example`), CI — GitHub Secrets.
- Прод-переменные api: `TOTP_ENCRYPTION_KEY` (обязательна, не менять после появления пользователей),
  `REGISTRATION_ENABLED`, `REGION`, `PUBLIC_API_BASE_URL`, `SYNC_RATE_LIMIT_MAX` — см. docs/deploy.md.
- CSP (Caddy): `script-src 'self' 'wasm-unsafe-eval'` — WebAssembly нужен Argon2id (hash-wasm); `worker-src 'self'` —
  KDF в Web Worker и service worker. Сторонних скриптов, CDN и шрифтов не подключаем.
- AGPL §13: пользователи сервиса должны иметь доступ к исходному коду — ссылка «Исходный код» в подвале и на
  странице «Принципы» (`apps/web/src/constants/links.ts`); не убирать.
- Логи контейнеров: json-file, ротация по объёму (5 × 10 МБ); IP в логах Caddy усечены.
- Бэкапы: pg_dump (настроить).
