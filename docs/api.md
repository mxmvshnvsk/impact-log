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
| Отложенное восстановление | `recovery_started_at`, `recovery_available_at` (когда запущено и когда созреет) |
| Объекты синхронизации | шифротекст ≤ 256 КиБ, версия, tombstone, `seq`, эпоха ключа `key_epoch` |
| Эпоха Master Key (ADR-0012) | `users.key_epoch` — с 1, +1 при каждой завершённой ротации MK |
| Идущая ротация MK | `key_rotations`: конверты нового MK (непрозрачные), SHA-256 нового `recoveryAuthKey`, устройство-инициатор, целевая эпоха; `rotation_objects`: черновик — перешифрованные живые объекты до commit |
| Устройства | зашифрованное название, SHA-256 секрета устройства, SHA-256 trust-токена, срок, `last_seen_at`, отзыв |
| Логин | не хранится: только HMAC-SHA256 (hex) ключом `HKDF(TOTP_ENCRYPTION_KEY, 'impact-log/login-hash/v1')` — `users.login_hash`. Наружу логин не отдаётся (в `user` его нет), otpauth:// URI для QR собирает клиент |
| Аккаунт | `accountId` (12 символов Crockford Base32 из 60 случайных бит), тариф |

Пароль → Argon2id(соль, параметры) → HKDF → **KEK** (остаётся на клиенте, открывает password-конверт)
и **authKey** (уходит на сервер вместо пароля). Recovery Key (`ILRK1-…`) → HKDF → recovery-KEK и
**recoveryAuthKey**. Из authKey нельзя получить KEK, поэтому сервер, проверяя вход, не может расшифровать данные.

## Аутентификация и сессии

- Cookie `il_session` (HttpOnly, SameSite=Strict, Path=/api, Secure в prod); в БД — SHA-256 токена.
- Виды сессий: `enrollment` (30 мин, регистрация до подтверждения 2FA), `second-factor` (5 мин, authKey верный,
  ждём код или Recovery Key вместо кода; хранит кандидата `deviceId`), `totp-reset` (5 мин с момента перехода,
  authKey и Recovery Key верны, ждём первый код новой 2FA; хранит кандидата и новый секрет
  `sessions.totp_pending_secret`, зашифрованный как `users.totp_secret`), `recovery` (15 мин, Recovery Key
  подтверждён; стадия `sessions.recovery_stage`: `key` → `unlocked-totp` | `unlocked-delayed`), `full` (сутки,
  продлевается при использовании; с «Запомнить этот компьютер» — 30 дней и постоянная cookie).
  Полная сессия всегда привязана к устройству.
- Не больше 5 неверных кодов 2FA (и неверных Recovery Key в `login/recovery-key`) на сессию, дальше
  `SESSION_EXPIRED`. Повтор TOTP-кода отклоняется (`totp_last_step`).
- **Блокировка перебора TOTP — на пользователя** (`modules/auth/totpGuard.ts`): каждая проверка кода по
  действующему секрету (register/confirm, login/verify, recovery/verify, account/totp/start и /confirm,
  account/delete) атомарно увеличивает `users.totp_failed_count` ещё до проверки; после 10 неудач подряд —
  `totp_locked_until = now + 15 мин`, каждая следующая неудача без успеха между ними — снова блокировка, вдвое
  длиннее (30 мин, 1 ч, … не больше 24 ч). Во время блокировки код не проверяется: `429 RATE_LIMITED` (и попытка
  сессии не тратится). Верный код, recovery/complete и сброс 2FA (login/totp-reset) обнуляют счётчик и снимают
  блокировку. `login/totp-reset` блокировку не проверяет и не увеличивает: его код — от секрета, который сессия
  только что выдала сама после пароля и Recovery Key (подбирать нечего), а заблокированная чужим перебором 2FA
  не должна мешать владельцу её сбросить; там действуют попытки сессии и лимит по IP. Цена блокировки: тот, кто
  знает пароль, может заблокировать вход по коду — выход для владельца — путь B (пароль + Recovery Key).
- **Секрет устройства** (`deviceSecret`, 32 байта base64url): выдаётся в ответе (`sessionResponseSchema`)
  только когда устройство создано этим запросом (register/confirm, login/verify, login/totp-reset,
  recovery/complete); в БД —
  SHA-256 (`devices.secret_hash`). Переданный `deviceId` переиспользуется, только если вместе с ним пришёл
  верный секрет (сравнение за постоянное время), устройство принадлежит пользователю и не отозвано; иначе
  создаётся новое устройство с новым секретом. Вход с доверенного устройства (cookie `il_device`) секрета
  не требует.
- «Запомнить этот компьютер» (`remember: true`): trust-токен в cookie `il_device` (Path=/api/auth, 30 дней),
  в БД — SHA-256 в `devices.trust_token_hash`. Вход с таким устройством требует authKey, но не код.
  Доверие снимается при «выйти везде», восстановлении доступа, сбросе 2FA по Recovery Key (со всех устройств) и
  отзыве устройства.
- CSRF: POST — только `application/json`; для всех изменяющих запросов `Origin` (если прислан) должен совпадать
  с хостом. PUT/PATCH/DELETE кросс-сайтово без preflight не отправить, поэтому Content-Type для них не требуется.
  Пустое JSON-тело трактуется как `{}`.
- Ошибки: `{ error: { code, details? } }`, коды — `ERROR_CODES` из shared (`details` — только несекретное:
  `availableAt` у `RECOVERY_NOT_READY`, идущая ротация у `ROTATION_IN_PROGRESS`, `{missing, stale}` у
  `ROTATION_INCOMPLETE`). Неизвестный логин и неверный authKey
  неразличимы (`INVALID_CREDENTIALS`, для неизвестного логина — проверка Argon2id «вхолостую»).
- Лимиты частоты → `429 RATE_LIMITED` (заголовок `Retry-After`):
  - по IP (ключ: IPv4 целиком, IPv6 — префикс /64, IPv4-mapped — как IPv4): prelogin 30/5 мин,
    register 5/60, login 10/5, коды 15/5–10 (register/confirm, login/verify, login/totp-reset 15/5,
    recovery/verify 15/10), login/recovery-key 10/15, recovery/begin 5/15, recovery/delay, recovery/resume и
    recovery/complete 10/15, account/* (включая recovery/cancel) 10/15, region 60/5;
  - по паре «логин + IP» (IPv6 — /64): login 10/15 мин. Глобального счётчика по логину нет намеренно — иначе
    любой, кто знает логин, мог бы запереть владельца; распределённому перебору мешают Argon2id на стороне
    атакующего и обязательная 2FA с блокировкой на пользователя. prelogin и recovery/begin — только по IP
    (соль для чужих логинов фальшивая, Recovery Key не подобрать);
  - по пользователю: `/api/sync/*` — `SYNC_RATE_LIMIT_MAX` запросов в минуту (по умолчанию 120);
    `/api/keys/rotation/stage` и `/commit` — столько же, отдельным счётчиком;
  - ротация MK: `/api/keys/rotation/start` и `/abort` — 10/15 мин с IP.
- JSON с символом NUL (`\u0000`) в строке или ключе → `400 VALIDATION_ERROR` (Postgres не хранит NUL в text).
- Логи: запрос — только метод, путь и усечённый IP; тела не логируются. Ошибки БД (`DrizzleQueryError`,
  `PostgresError`) — только имя, SQLSTATE (`code`), имя ограничения и кадры стека: без текста запроса,
  параметров, `detail` и сообщения (`lib/logging.ts`).

## Маршруты

Сессия: «—» — не нужна; `full` / `enrollment` / `second-factor` / `totp-reset` / `recovery` — нужен этот вид
сессии (`recovery` — в любой стадии, `recovery (unlocked)` — только после verify или resume).

| Метод и путь | Сессия | Тело → ответ | Примечания |
| --- | --- | --- | --- |
| `GET /api/health` | — | → `{status, db, version}` | |
| `POST /api/auth/prelogin` | — | `{login}` → `{kdf, salt}` | Для несуществующего / незавершённого логина — детерминированная фальшивая соль, `kdf = DEFAULT_KDF_PARAMS` |
| `POST /api/auth/register` | — | `registerRequestSchema` → `{secret}` | Ставит enrollment-сессию. `LOGIN_TAKEN` (409), `REGISTRATION_CLOSED` (403). Брошенные pending-регистрации переиспользуются |
| `POST /api/auth/register/confirm` | enrollment | `{code, remember}` → `{user, deviceId, deviceSecret}` | Активирует аккаунт, создаёт первое устройство |
| `POST /api/auth/login` | — | `{login, authKey, deviceId?, deviceSecret?}` → `{next:'second-factor'}` \| `{next:'done', user, deviceId}` | `done` — валидная cookie `il_device` этого пользователя (сессия на 30 дней). `deviceId` без верного `deviceSecret` игнорируется |
| `POST /api/auth/login/verify` | second-factor | `{code, remember}` → `{user, deviceId, deviceSecret?}` | Устройство — кандидат из login (секрет совпал, не отозвано) или новое (тогда `deviceSecret`) |
| `POST /api/auth/login/recovery-key` | second-factor | `{recoveryAuthKey}` → `{secret}` | Путь B. Неверный ключ → `401 INVALID_CREDENTIALS` + попытка сессии (5-я → `SESSION_EXPIRED`). Верный → новая 2FA, сессия становится `totp-reset` (попытки с нуля, 5 мин) |
| `POST /api/auth/login/totp-reset` | totp-reset | `{code, remember}` → `{user, deviceId, deviceSecret?}` | Код новой 2FA (блокировку перебора не проверяет, см. выше). Секрет заменён, `totp_last_step` — шаг этого кода, блокировка снята, все остальные сессии удалены, доверие снято со всех устройств (`remember` — доверие этому), отложенное восстановление снято. Сессия не `via_recovery` |
| `POST /api/auth/recovery/begin` | — | `{login, recoveryAuthKey}` → `{delayed: {status: none\|pending\|ready, availableAt?}}` | Ставит recovery-сессию (стадия `key`), конверт **не** выдаёт. `delayed` — отложенное восстановление (истёкшее → `none`). Ошибка — `INVALID_CREDENTIALS` |
| `POST /api/auth/recovery/verify` | recovery | `{code}` → `{recoveryEnvelope}` | Путь A: код 2FA (блокировка перебора, защита от повтора, попытки сессии) → стадия `unlocked-totp` |
| `POST /api/auth/recovery/delay` | recovery | — → `{availableAt}` | Путь C: запускает отсчёт `RECOVERY_DELAY_HOURS` (48 ч); идёт или созрел и не истёк — прежний срок |
| `POST /api/auth/recovery/resume` | recovery | — → `{recoveryEnvelope}` | Путь C: `availableAt ≤ now ≤ availableAt + RECOVERY_READY_TTL_DAYS` → стадия `unlocked-delayed`. Рано → `403 RECOVERY_NOT_READY` с `details.availableAt`; не начато / истекло → `403 RECOVERY_NOT_READY` без `details` |
| `POST /api/auth/recovery/complete` | recovery (unlocked) | `{authKey, kdf, salt, passwordEnvelope, deviceId?, deviceSecret?}` → `{user, deviceId, deviceSecret?}` | До verify/resume → `403 FORBIDDEN`. Новый пароль; все сессии удаляются, доверие устройств снимается, блокировка TOTP и отложенное восстановление снимаются, идущая ротация MK отменяется; обычная (не 30-дневная) сессия, `via_recovery` — только после пути C |
| `POST /api/auth/logout` | full | `{everywhere?}` → `{ok}` | `everywhere` — все сессии и доверие всех устройств |
| `GET /api/auth/me` | full | → `{user, deviceId, recoveryPending}` | `deviceSecret` не отдаётся. `recoveryPending: {availableAt} \| null` — не null, пока отсчёт идёт или созрел и не истёк |
| `GET /api/keys` | full | → `{envelopes: [{type, envelope, updatedAt}], keyEpoch, rotation}` | Конверты и `keyEpoch` — одним снимком (одной эпохи). `rotation: {targetEpoch, startedAt, deviceId, staged} \| null` — идущая ротация MK |
| `POST /api/keys/rotation/start` | full | `{currentAuthKey, passwordEnvelope, recoveryEnvelope, recoveryAuthKey}` → `{targetEpoch, startedAt, deviceId, staged}` | Ротация MK (ниже). Неверный `currentAuthKey` → `403 INVALID_CREDENTIALS`; уже идёт → `409 ROTATION_IN_PROGRESS` (`details` — идущая ротация) |
| `POST /api/keys/rotation/stage` | full, устройство-инициатор | `{objects: [{objectId, version, ciphertext}]}` (1–200) → `{results: [{objectId, status: staged\|rejected}], staged}` | Тело ≤ 8 МиБ. Нет ротации → `409 NO_ROTATION`; другое устройство → `403 FORBIDDEN` |
| `POST /api/keys/rotation/commit` | full, устройство-инициатор | — → `{keyEpoch}` | Черновик неполон → `409 ROTATION_INCOMPLETE`, `details: {missing, stale}`; нет ротации → `409 NO_ROTATION`; другое устройство → `403 FORBIDDEN`. Остальные сессии удаляются |
| `POST /api/keys/rotation/abort` | full | инициатор — без тела; другое устройство — `{currentAuthKey}` → `{ok}` | Без ключа / неверный с другого устройства → `403 INVALID_CREDENTIALS`; ротации нет → `ok` |
| `POST /api/account/password` | full | `{currentAuthKey, authKey, kdf, salt, passwordEnvelope}` → `{ok}` | Остальные сессии удаляются, отложенное восстановление снимается, идущая ротация MK отменяется |
| `POST /api/account/recovery-key` | full | `{currentAuthKey, recoveryEnvelope, recoveryAuthKey}` → `{ok}` | Старый Recovery Key сразу перестаёт работать; начатые им восстановления и сбросы 2FA (recovery- и totp-reset-сессии) удаляются, отложенное восстановление снимается, идущая ротация MK отменяется |
| `POST /api/account/recovery/cancel` | full | — → `{ok}` | Снимает отложенное восстановление, удаляет recovery- и totp-reset-сессии пользователя. Без повторного подтверждения (действие только защитное) |
| `POST /api/account/totp/start` | full | `{currentAuthKey, code?}` → `{secret}` | `code` — текущий код 2FA (блокировка перебора, защита от повтора); без него — `400 INVALID_CODE`, кроме сессии после отложенного восстановления (путь C, `via_recovery`). Новый секрет ждёт подтверждения, старый пока работает |
| `POST /api/account/totp/confirm` | full | `{code}` → `{ok}` | Код по новому секрету; остальные сессии удаляются, у текущей снимается `via_recovery` (без кода — только один перевыпуск) |
| `POST /api/account/delete` | full | `{currentAuthKey, code}` → `{ok}` | Удаляет всё каскадом, сбрасывает cookie |
| `GET /api/devices` | full | → `{devices: [{deviceId, encryptedLabel, trusted, createdAt, lastSeenAt, current}]}` | Только не отозванные |
| `PATCH /api/devices/:deviceId` | full | `{encryptedLabel}` → `{ok}` | Чужое / несуществующее / отозванное → `NOT_FOUND` |
| `DELETE /api/devices/:deviceId` | full | → `{ok}` | Отзыв: сессии устройства удаляются, доверие снимается; если устройство начало ротацию MK, она отменяется. Текущее → `FORBIDDEN` (для него есть logout) |
| `GET /api/entitlements` | full | → `{plan, profile, usage: {activeImpacts, devices, storageBytes, objects}}` | `profile = resolveEntitlements({planId: plan})` |
| `GET /api/sync/pull?cursor&limit` | full + `X-Impact-Account` | → `{changes, cursor, hasMore}` | См. ниже |
| `POST /api/sync/push` | full + `X-Impact-Account` | `{changes}` → `{results}` | Тело ≤ 8 МиБ, иначе `413 PAYLOAD_TOO_LARGE` |
| `POST /api/region/resolve` | — | `{login}` → `{region, apiBaseUrl, ttlSeconds}` | Одинаково для любых логинов |

Повторное подтверждение в `/api/account/*` и `/api/keys/rotation/start` (и `abort` не с устройства-инициатора):
неверный `currentAuthKey` → **403** `INVALID_CREDENTIALS`
(не 401: сессия жива, клиент не должен разлогиниваться). Неверный / отсутствующий код → 400 `INVALID_CODE`.

## Восстановление доступа (ADR-0008 §8)

Recovery Key + ещё один фактор; без второго фактора — только с задержкой.

| Путь | Что есть у пользователя | Маршруты | Результат |
| --- | --- | --- | --- |
| A. Забыт пароль | Recovery Key + код 2FA | `recovery/begin` → `recovery/verify` → `recovery/complete` | Новый пароль; 2FA прежняя; сессия не `via_recovery` |
| B. Потерян телефон | пароль + Recovery Key | `login` → `login/recovery-key` → `login/totp-reset` | Новая 2FA; пароль прежний |
| C. Потеряно всё | только Recovery Key | `recovery/begin` → `recovery/delay` … 48 ч … `recovery/begin` → `recovery/resume` → `recovery/complete` | Новый пароль; сессия `via_recovery` → перевыпуск 2FA без кода |

- Конверт MK под Recovery Key (`recoveryEnvelope`) выдаётся только `recovery/verify` (A) и `recovery/resume` (C);
  `recovery/begin` лишь доказывает владение ключом.
- Отложенное восстановление (C): `users.recovery_available_at = started + RECOVERY_DELAY_HOURS`; `resume` доступен в
  окне `[availableAt, availableAt + RECOVERY_READY_TTL_DAYS]` (7 дней), дальше — как не начатое (`begin` → `none`,
  периодическая уборка обнуляет поля). Пока оно идёт или созрело, `GET /api/auth/me` на вошедших устройствах отдаёт
  `recoveryPending`, и владелец может отменить (`POST /api/account/recovery/cancel`).
- Снимается: отменой, завершением пути A или C, сбросом 2FA (B), сменой пароля, перевыпуском Recovery Key, ротацией
  MK (commit), удалением аккаунта. Обычный вход и перевыпуск 2FA — не снимают. Отмена, смена пароля и перевыпуск ключа удаляют и
  незавершённые recovery-/totp-reset-сессии, поэтому уже выданная стадия `unlocked-*` тоже теряется.
- Стадии recovery-сессии: `verify` и `resume` работают в любой стадии (`resume` не понижает `unlocked-totp`);
  `complete` — только из `unlocked-*`, одноразовый (сессия удаляется в той же транзакции).
- Время отложенного восстановления — часы приложения (как сроки сессий).

## Ротация Master Key (ADR-0012)

Новый MK, все живые объекты перешифровываются им (свежие DEK), новый password-конверт (тот же пароль, соль и
KDF → тот же `authKey`) и новый Recovery Key. Шифротексты новой эпохи копятся в черновике и подменяют живые
объекты только атомарным commit — аккаунт никогда не бывает «наполовину перешифрованным».

1. `start` (любое устройство, `currentAuthKey`) → ротация с `targetEpoch = keyEpoch + 1`; инициатор — устройство
   сессии. Одна ротация на аккаунт. Конверты нового MK и хеш нового `recoveryAuthKey` лежат в `key_rotations` и до
   commit ни на что не влияют.
2. `stage` (только инициатор): каждый объект должен быть **живым** объектом пользователя, шифротекст — не больше
   `2 × живой + 4 КиБ` → upsert в черновик (`version` — версия, с которой делалась перешифровка) → `staged`;
   иначе `rejected`. Повтор `objectId` заменяет запись черновика.
3. `commit` (только инициатор), одна транзакция под блокировкой строки пользователя: у каждого живого объекта
   должна быть запись черновика с его текущей версией, иначе `409 ROTATION_INCOMPLETE { missing, stale }` (до 1000
   id в каждом списке; ничего не меняется — клиент делает pull, дошифровывает и повторяет). Иначе: шифротексты
   черновика → живые объекты (`key_epoch = target`, новые `seq`, **версии прежние**, tombstone'ы не трогаются,
   квоты не применяются), конверты и `recovery_auth_hash` ротации → текущие, `users.key_epoch = target`, ротация и
   черновик удалены, **все другие сессии** удалены (в том числе recovery/totp-reset), отложенное восстановление
   снято. «Запомнить этот компьютер» сохраняется.
4. `abort`: с инициатора — без тела, с другого устройства — `{currentAuthKey}`. Удаляет ротацию и черновик.

Ротация **отменяется автоматически** при смене пароля, перевыпуске Recovery Key, `recovery/complete` и отзыве
устройства-инициатора. Пока ротация идёт, push и pull работают как обычно у всех устройств (старым ключом) —
устаревший черновик ловит commit (`stale`). stage и commit принимают необязательный `X-Impact-Account`: прислан
и не совпал с пользователем сессии → `409 ACCOUNT_MISMATCH`.

## Синхронизация

Объект — `(objectId, kind, version, ciphertext | null, deleted, seq, keyEpoch)`; `kind` пока только `impact`,
`keyEpoch` — эпоха MK шифротекста (ADR-0012; у tombstone — эпоха аккаунта на момент удаления).
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
не «перепрыгивает» незакоммиченное. Для каждого изменения `{objectId, kind, baseVersion, ciphertext, keyEpoch}`
(`keyEpoch` не прислан — 1):

| Условие | Результат |
| --- | --- |
| `keyEpoch` больше эпохи аккаунта (будущие эпохи — только через черновик ротации) | `rejected INVALID` |
| `ciphertext ≠ null` и `keyEpoch` меньше эпохи аккаунта | `rejected STALE_KEY` — клиент перешифровывает хранилище новым MK |
| объекта нет и `baseVersion > 0` | `rejected INVALID` |
| объекта нет и `ciphertext = null` (tombstone «из ничего») | `rejected INVALID` |
| объект есть, но другого `kind` | `rejected INVALID` |
| объект есть и `version ≠ baseVersion` | `conflict` + `server` (текущая серверная ветка) — клиент сливает сам |
| создание (объекта нет или он tombstone, `ciphertext ≠ null`) сверх `maxActiveImpacts` | `rejected QUOTA_EXCEEDED` |
| новый живой объект сверх `maxObjects` или рост байт сверх `maxStorageBytes` | `rejected QUOTA_EXCEEDED` |
| иначе | `accepted {version: прежняя + 1, seq}` |

`ciphertext: null` — удаление (tombstone, `deleted: true`); удалить можно только существующий объект. Tombstone
со старой эпохой принимается (ключа в нём нет) и записывается с эпохой аккаунта; принятый шифротекст хранится с
`keyEpoch` изменения. Pull и `conflict.server` отдают `keyEpoch` объекта.
Квоты (`canCreateImpact`, `canStoreObjects` из shared):

- `maxActiveImpacts` считает активные (не удалённые) impact и ограничивает **только создание** (включая
  «воскрешение» tombstone'а);
- `maxStorageBytes` — сумма `octet_length(ciphertext)` всех объектов пользователя, `maxObjects` — число
  **живых** объектов (tombstone'ы не считаются). Ограничивается только рост: новый живой объект или больше байт (создание, «воскрешение»,
  обновление большим шифротекстом). Уменьшение и удаление разрешены всегда.

Удаление сразу освобождает место под `maxActiveImpacts`, `maxObjects` и байты — в том числе внутри того же push;
строка tombstone остаётся в БД (уборки tombstone'ов пока нет) и в `maxObjects` не входит, но все строки вместе
с tombstone'ами ограничены `2 × maxObjects` — новая строка сверх этого → `rejected QUOTA_EXCEEDED`.

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
| `TOTP_ENCRYPTION_KEY` | нули (в prod обязательна) | 32 байта hex. Сам ключом не используется: из него HKDF выводит ключ шифрования TOTP-секретов (метка `impact-log/v1/totp-secret`), ключ фальшивой соли prelogin (метка `impact-log/prelogin-salt/v1`) и ключ HMAC логина (метка `impact-log/login-hash/v1`). Нужен и `migrate` (миграция 0006 переводит существующие аккаунты на хеш логина). Не менять после появления пользователей: без прежнего ключа не войти ни в один аккаунт |
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
- `0004_recovery_factors`: `users.recovery_started_at`, `users.recovery_available_at` (отложенное восстановление),
  `sessions.recovery_stage` (стадия recovery-сессии; `null` у старых = `key`), `sessions.totp_pending_secret`
  (новый секрет в `totp-reset`-сессии). Новый вид сессии `totp-reset` — в колонке `text`, миграция не нужна.
  Recovery-сессии, начатые до 0004, завершить нельзя (стадия `key`) — начать заново.
- `0005_key_rotation` (ADR-0012): `users.key_epoch` и `objects.key_epoch` (`integer not null default 1` —
  существующие данные получают эпоху 1), таблицы `key_rotations` (идущая ротация MK) и `rotation_objects`
  (её черновик, внешний ключ на `key_rotations` с каскадом). Данные не переносятся.
- E2E: при запущенном API (`TRUST_PROXY=true`, чтобы «пользователи» скрипта шли с разных IP) и чистой БД —
  `cd apps/api && node scripts/e2e.mjs` (переменные `API_URL`, `DATABASE_URL` — по умолчанию локальные;
  `API_LOG_FILE` — лог API этого прогона, по умолчанию `/tmp/api.log`: проверяется, что в нём нет секретов
  и параметров SQL, если файл не пишется — проверка пропускается). Скрипт готовит данные прямо в БД (тариф,
  тысячи tombstone'ов, объект на 50 МиБ, временный CHECK для ошибки БД).
