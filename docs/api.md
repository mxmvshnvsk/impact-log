# HTTP API (`apps/api`)

Краткий справочник. Контракты (zod-схемы, типы, коды ошибок) — `packages/shared/src`:
`schemas/auth.ts`, `schemas/account.ts`, `schemas/sync.ts`, `entitlements.ts`, `errors.ts`.
Все маршруты — под `/api`, тела и ответы валидируются этими схемами.

## Модель: local-first + E2EE

Клиент владеет доменом, открытым текстом и аналитикой. Сервер — это аутентификация, хранение и синхронизация
**непрозрачных** зашифрованных объектов, ключевые конверты, устройства и тарифы (entitlements).
Сервер никогда не видит ни пароль, ни Master Key (MK), ни содержимое записей.

| Что хранит сервер | Как |
| --- | --- |
| `authKey` (выведен из пароля на клиенте, 32 байта) | Argon2id-хеш (PHC), m=19 MiB, t=2 |
| Параметры KDF и соль пароля | как есть — отдаются через `prelogin` |
| Конверты MK: `password` (под KEK из пароля), `recovery` (под ключ из Recovery Key) | непрозрачные строки ≤ 4096 символов |
| `recoveryAuthKey` (из Recovery Key) | SHA-256 (hex), сравнение за постоянное время |
| TOTP-секрет | `v2:` + AES-256-GCM (тег 16 байт) ключом `HKDF(TOTP_ENCRYPTION_KEY, 'impact-log/v1/totp-secret')`, AAD = `users.id` |
| Счётчик неудачных кодов 2FA | `totp_failed_count`, `totp_locked_until` (блокировка перебора) |
| Объекты синхронизации | шифротекст ≤ 256 КиБ, версия, tombstone, `seq` |
| Устройства | зашифрованное название, SHA-256 секрета устройства, SHA-256 trust-токена, срок, `last_seen_at`, отзыв |
| Аккаунт | `accountId` (12 символов Crockford Base32 из 60 случайных бит), логин, тариф |

Пароль → Argon2id(соль, параметры) → HKDF → **KEK** (остаётся на клиенте, открывает password-конверт)
и **authKey** (уходит на сервер вместо пароля). Recovery Key (`ILRK1-…`) → HKDF → recovery-KEK и
**recoveryAuthKey**. Из authKey нельзя получить KEK, поэтому сервер, проверяя вход, не может расшифровать данные.

## Аутентификация и сессии

- Cookie `il_session` (HttpOnly, SameSite=Strict, Path=/api, Secure в prod); в БД — SHA-256 токена.
- Виды сессий: `enrollment` (30 мин, регистрация до подтверждения 2FA), `second-factor` (5 мин, authKey верный,
  ждём код; хранит кандидата `deviceId`), `recovery` (15 мин, Recovery Key подтверждён), `full` (сутки,
  продлевается при использовании; с «Запомнить этот компьютер» — 30 дней и постоянная cookie).
  Полная сессия всегда привязана к устройству.
- Не больше 5 неверных кодов 2FA на сессию, дальше `SESSION_EXPIRED`. Повтор TOTP-кода отклоняется (`totp_last_step`).
- **Блокировка перебора TOTP — на пользователя** (`modules/auth/totpGuard.ts`): каждая проверка кода
  (register/confirm, login/verify, account/totp/start и /confirm, account/delete) атомарно увеличивает
  `users.totp_failed_count` ещё до проверки; после 10 неудач подряд — `totp_locked_until = now + 15 мин`,
  каждая следующая неудача без успеха между ними — снова блокировка, вдвое длиннее (30 мин, 1 ч, … не больше
  24 ч). Во время блокировки код не проверяется: `429 RATE_LIMITED` (и попытка сессии не тратится). Верный код
  и восстановление по Recovery Key обнуляют счётчик и снимают блокировку. Цена: тот, кто знает пароль, может
  заблокировать вход по коду — выход для владельца — Recovery Key.
- **Секрет устройства** (`deviceSecret`, 32 байта base64url): выдаётся в ответе (`sessionResponseSchema`)
  только когда устройство создано этим запросом (register/confirm, login/verify, recovery/complete); в БД —
  SHA-256 (`devices.secret_hash`). Переданный `deviceId` переиспользуется, только если вместе с ним пришёл
  верный секрет (сравнение за постоянное время), устройство принадлежит пользователю и не отозвано; иначе
  создаётся новое устройство с новым секретом. Вход с доверенного устройства (cookie `il_device`) секрета
  не требует.
- «Запомнить этот компьютер» (`remember: true`): trust-токен в cookie `il_device` (Path=/api/auth, 30 дней),
  в БД — SHA-256 в `devices.trust_token_hash`. Вход с таким устройством требует authKey, но не код.
  Доверие снимается при «выйти везде», восстановлении доступа и отзыве устройства.
- CSRF: POST — только `application/json`; для всех изменяющих запросов `Origin` (если прислан) должен совпадать
  с хостом. PUT/PATCH/DELETE кросс-сайтово без preflight не отправить, поэтому Content-Type для них не требуется.
  Пустое JSON-тело трактуется как `{}`.
- Ошибки: `{ error: { code, details? } }`, коды — `ERROR_CODES` из shared. Неизвестный логин и неверный authKey
  неразличимы (`INVALID_CREDENTIALS`, для неизвестного логина — проверка Argon2id «вхолостую»).
- Лимиты частоты → `429 RATE_LIMITED` (заголовок `Retry-After`):
  - по IP (ключ: IPv4 целиком, IPv6 — префикс /64, IPv4-mapped — как IPv4): prelogin 30/5 мин,
    register 5/60, login 10/5, коды 15/5–10, recovery/begin 5/15, recovery/complete 10/15, account/* 10/15,
    region 60/5;
  - по логину из тела (с любых IP; отдельный счётчик на маршрут): prelogin 20/15 мин, login 10/15,
    recovery/begin 5/15. Цена — тот, кто знает логин, может на 15 минут помешать его входу;
  - по пользователю: `/api/sync/*` — `SYNC_RATE_LIMIT_MAX` запросов в минуту (по умолчанию 120).
- JSON с символом NUL (`\u0000`) в строке или ключе → `400 VALIDATION_ERROR` (Postgres не хранит NUL в text).
- Логи: запрос — только метод, путь и усечённый IP; тела не логируются. Ошибки БД (`DrizzleQueryError`,
  `PostgresError`) — только имя, SQLSTATE (`code`), имя ограничения и кадры стека: без текста запроса,
  параметров, `detail` и сообщения (`lib/logging.ts`).

## Маршруты

Сессия: «—» — не нужна; `full` / `enrollment` / `second-factor` / `recovery` — нужен этот вид сессии.

| Метод и путь | Сессия | Тело → ответ | Примечания |
| --- | --- | --- | --- |
| `GET /api/health` | — | → `{status, db, version}` | |
| `POST /api/auth/prelogin` | — | `{login}` → `{kdf, salt}` | Для несуществующего / незавершённого логина — детерминированная фальшивая соль, `kdf = DEFAULT_KDF_PARAMS` |
| `POST /api/auth/register` | — | `registerRequestSchema` → `{otpauthUri, secret}` | Ставит enrollment-сессию. `LOGIN_TAKEN` (409), `REGISTRATION_CLOSED` (403). Брошенные pending-регистрации переиспользуются |
| `POST /api/auth/register/confirm` | enrollment | `{code, remember}` → `{user, deviceId, deviceSecret}` | Активирует аккаунт, создаёт первое устройство |
| `POST /api/auth/login` | — | `{login, authKey, deviceId?, deviceSecret?}` → `{next:'second-factor'}` \| `{next:'done', user, deviceId}` | `done` — валидная cookie `il_device` этого пользователя (сессия на 30 дней). `deviceId` без верного `deviceSecret` игнорируется |
| `POST /api/auth/login/verify` | second-factor | `{code, remember}` → `{user, deviceId, deviceSecret?}` | Устройство — кандидат из login (секрет совпал, не отозвано) или новое (тогда `deviceSecret`) |
| `POST /api/auth/recovery/begin` | — | `{login, recoveryAuthKey}` → `{recoveryEnvelope}` | Ставит recovery-сессию. Ошибка — `INVALID_CREDENTIALS` |
| `POST /api/auth/recovery/complete` | recovery | `{authKey, kdf, salt, passwordEnvelope, deviceId?, deviceSecret?}` → `{user, deviceId, deviceSecret?}` | Новый пароль; все сессии удаляются, доверие устройств снимается, блокировка TOTP снимается; обычная (не 30-дневная) сессия с флагом `via_recovery` |
| `POST /api/auth/logout` | full | `{everywhere?}` → `{ok}` | `everywhere` — все сессии и доверие всех устройств |
| `GET /api/auth/me` | full | → `{user, deviceId}` | `deviceSecret` не отдаётся |
| `GET /api/keys` | full | → `{envelopes: [{type, envelope, updatedAt}]}` | |
| `POST /api/account/password` | full | `{currentAuthKey, authKey, kdf, salt, passwordEnvelope}` → `{ok}` | Остальные сессии удаляются |
| `POST /api/account/recovery-key` | full | `{currentAuthKey, recoveryEnvelope, recoveryAuthKey}` → `{ok}` | Старый Recovery Key сразу перестаёт работать; начатые им восстановления (recovery-сессии) удаляются |
| `POST /api/account/totp/start` | full | `{currentAuthKey, code?}` → `{otpauthUri, secret}` | `code` — текущий код 2FA (блокировка перебора, защита от повтора); без него — `400 INVALID_CODE`, кроме сессии после recovery/complete (`via_recovery`). Новый секрет ждёт подтверждения, старый пока работает |
| `POST /api/account/totp/confirm` | full | `{code}` → `{ok}` | Код по новому секрету; остальные сессии удаляются, у текущей снимается `via_recovery` (без кода — только один перевыпуск) |
| `POST /api/account/delete` | full | `{currentAuthKey, code}` → `{ok}` | Удаляет всё каскадом, сбрасывает cookie |
| `GET /api/devices` | full | → `{devices: [{deviceId, encryptedLabel, trusted, createdAt, lastSeenAt, current}]}` | Только не отозванные |
| `PATCH /api/devices/:deviceId` | full | `{encryptedLabel}` → `{ok}` | Чужое / несуществующее / отозванное → `NOT_FOUND` |
| `DELETE /api/devices/:deviceId` | full | → `{ok}` | Отзыв: сессии устройства удаляются, доверие снимается. Текущее → `FORBIDDEN` (для него есть logout) |
| `GET /api/entitlements` | full | → `{plan, profile, usage: {activeImpacts, devices, storageBytes, objects}}` | `profile = resolveEntitlements({planId: plan})` |
| `GET /api/sync/pull?cursor&limit` | full + `X-Impact-Account` | → `{changes, cursor, hasMore}` | См. ниже |
| `POST /api/sync/push` | full + `X-Impact-Account` | `{changes}` → `{results}` | Тело ≤ 8 МиБ, иначе `413 PAYLOAD_TOO_LARGE` |
| `POST /api/region/resolve` | — | `{login}` → `{region, apiBaseUrl, ttlSeconds}` | Одинаково для любых логинов |

Повторное подтверждение в `/api/account/*`: неверный `currentAuthKey` → **403** `INVALID_CREDENTIALS`
(не 401: сессия жива, клиент не должен разлогиниваться). Неверный / отсутствующий код → 400 `INVALID_CODE`.

## Синхронизация

Объект — `(objectId, kind, version, ciphertext | null, deleted, seq)`; `kind` пока только `impact`.
Каждая запись объекта получает `seq = nextval('object_seq')` — монотонный курсор.

**Заголовок `X-Impact-Account`** (`SYNC_ACCOUNT_HEADER`): каждый запрос `/api/sync/*` несёт публичный
`accountId` аккаунта, к которому привязано локальное хранилище. Нет заголовка → `400 VALIDATION_ERROR`;
не совпадает с пользователем сессии → `409 ACCOUNT_MISMATCH` (в браузере вошли в другой аккаунт — данные
двух аккаунтов не смешиваются). Проверки сессии, лимита частоты (на пользователя, `SYNC_RATE_LIMIT_MAX`/мин)
и заголовка идут в `onRequest` — до разбора тела.

**pull**: изменения пользователя с `seq > cursor` по возрастанию `seq`, не больше `limit` (по умолчанию 500,
максимум 1000) и не больше `PULL_MAX_BYTES` = 8 МиБ суммарного шифротекста (но хотя бы один объект).
Объект приходит в последнем состоянии (одна запись на объект). `cursor` в ответе — `seq` последнего
отданного изменения (или прежний, если изменений нет); `hasMore` — есть ли ещё (честно: считается по
следующей строке, а не по заполненности страницы).

**push**: изменения применяются по порядку в одной транзакции; пуши одного пользователя сериализуются
(`SELECT … FROM users … FOR UPDATE`), поэтому `seq` внутри пользователя выдаются в порядке коммитов и pull
не «перепрыгивает» незакоммиченное. Для каждого изменения `{objectId, kind, baseVersion, ciphertext}`:

| Условие | Результат |
| --- | --- |
| объекта нет и `baseVersion > 0` | `rejected INVALID` |
| объекта нет и `ciphertext = null` (tombstone «из ничего») | `rejected INVALID` |
| объект есть, но другого `kind` | `rejected INVALID` |
| объект есть и `version ≠ baseVersion` | `conflict` + `server` (текущая серверная ветка) — клиент сливает сам |
| создание (объекта нет или он tombstone, `ciphertext ≠ null`) сверх `maxActiveImpacts` | `rejected QUOTA_EXCEEDED` |
| новый живой объект сверх `maxObjects` или рост байт сверх `maxStorageBytes` | `rejected QUOTA_EXCEEDED` |
| иначе | `accepted {version: прежняя + 1, seq}` |

`ciphertext: null` — удаление (tombstone, `deleted: true`); удалить можно только существующий объект.
Квоты (`canCreateImpact`, `canStoreObjects` из shared):

- `maxActiveImpacts` считает активные (не удалённые) impact и ограничивает **только создание** (включая
  «воскрешение» tombstone'а);
- `maxStorageBytes` — сумма `octet_length(ciphertext)` всех объектов пользователя, `maxObjects` — число
  **живых** объектов (tombstone'ы не считаются). Ограничивается только рост: новый живой объект или больше байт (создание, «воскрешение»,
  обновление большим шифротекстом). Уменьшение и удаление разрешены всегда.

Удаление сразу освобождает место под `maxActiveImpacts`, `maxObjects` и байты — в том числе внутри того же push;
строка tombstone остаётся в БД (уборки tombstone'ов пока нет), но в лимиты не входит.

## Тарифы

`users.plan` ∈ `PLAN_IDS` (`PILOT` по умолчанию для новых аккаунтов, `FREE`, `PRO`). Профиль возможностей —
`resolveEntitlements` из shared. Сервер применяет в push `maxActiveImpacts`, `maxStorageBytes` и `maxObjects`;
остальные лимиты и capabilities — информация для клиента.

| Тариф | `maxActiveImpacts` | `maxStorageBytes` | `maxObjects` |
| --- | --- | --- | --- |
| PILOT | — | 512 МиБ | 100 000 |
| FREE | 15 | 50 МиБ | 1 000 |
| PRO | — | 5 ГиБ | 1 000 000 |

Потолок хранилища есть даже у пилота — защита от злоупотреблений. Профили — `revision: 2` (добавлены лимиты
хранилища).

## Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://impact:impact@localhost:5432/impact` (в prod обязательна) | Postgres |
| `TOTP_ENCRYPTION_KEY` | нули (в prod обязательна) | 32 байта hex. Сам ключом не используется: из него HKDF выводит ключ шифрования TOTP-секретов (метка `impact-log/v1/totp-secret`) и ключ фальшивой соли prelogin (метка `impact-log/prelogin-salt/v1`). Не менять после появления пользователей |
| `SYNC_RATE_LIMIT_MAX` | `120` | Запросов `/api/sync/*` в минуту на пользователя |
| `REGISTRATION_ENABLED` | `true` | `false` закрывает регистрацию |
| `REGION` | `ru-1` | Регион инстанса для `/api/region/resolve` |
| `PUBLIC_API_BASE_URL` | `/api` | Базовый URL API для клиентов (абсолютный или путь от origin) |
| `COOKIE_SECURE` | `true` в production | Secure-флаг cookie |
| `TRUST_PROXY` | `false` | `true` только за reverse proxy (Caddy) — иначе X-Forwarded-For можно подделать |
| `HOST`, `PORT`, `LOG_LEVEL`, `APP_VERSION`, `NODE_ENV` | `127.0.0.1`, `3000`, `info`, `dev`, `development` | |

## Миграции и проверка

- `0002_e2ee` удаляет старые таблицы (`users`, `sessions`, `recovery_codes`, `trusted_devices`) и создаёт новую
  схему: `users`, `key_envelopes`, `devices`, `sessions`, `objects`, последовательность `object_seq`.
  Работает и поверх 0000–0001, и на пустой базе.
- `0003_hardening`: `users.totp_failed_count`, `users.totp_locked_until`, `devices.secret_hash`,
  `sessions.via_recovery`. TOTP-секреты теперь в формате `v2:` (AAD = id пользователя); секреты старого
  формата не читаются — аккаунты, созданные до 0003 (если есть), нужно создать заново.
- E2E: при запущенном API (`TRUST_PROXY=true`, чтобы «пользователи» скрипта шли с разных IP) и чистой БД —
  `cd apps/api && node scripts/e2e.mjs` (переменные `API_URL`, `DATABASE_URL` — по умолчанию локальные;
  `API_LOG_FILE` — лог API этого прогона, по умолчанию `/tmp/api.log`: проверяется, что в нём нет секретов
  и параметров SQL, если файл не пишется — проверка пропускается). Скрипт готовит данные прямо в БД (тариф,
  тысячи tombstone'ов, объект на 50 МиБ, временный CHECK для ошибки БД).
