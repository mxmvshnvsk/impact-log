# impact log для Chrome

Расширение Manifest V3 для быстрого захвата записей в impact log со страницы браузера.
Оно **не ходит в API и ничего не хранит**: собирает черновик (`ImpactDraft`, Capture Protocol)
и открывает новую вкладку `<app-url>/capture#draft=<base64url>`. Там web-клиент показывает форму,
вы подтверждаете — запись шифруется и сохраняется в вашем impact log.

## Что умеет

- **Окно расширения** (клик по иконке или `Alt+Shift+I`): заголовок (из заголовка вкладки, без хвостов
  вроде «· Pull Request #42 · org/repo»), ссылка (адрес вкладки; тип распознаётся — PR, задача, коммит,
  документ), выделенный текст (цитатой к ссылке или в описание), описание, влияние 1–5, категории и метки
  через запятую. `Ctrl/⌘+Enter` — отправить. Незаконченный черновик помнится для этой вкладки
  (`chrome.storage.session`, в памяти) до отправки или закрытия браузера.
- **Контекстное меню**: «Сохранить страницу / выделенное / ссылку в impact log» — сразу открывает
  `/capture` с черновиком (влияние — из настроек). Если выделенное слишком длинное для ссылки, цитата
  ужимается.
- **Настройки**: адрес impact log (по умолчанию `https://impact-log.com`; `http://` — только для
  localhost, например `http://localhost:5173`) и влияние по умолчанию; хранятся в `chrome.storage.sync`.

Интерфейс — на языке браузера (en / ru), тема — по системной (`prefers-color-scheme`), токены — те же,
что в web-клиенте (`apps/web/src/styles/tokens.css`).

## Сборка

```sh
pnpm install
pnpm --filter @impact-log/chrome-extension build    # tsup + scripts/copy-static.mjs → apps/chrome-extension/dist
pnpm --filter @impact-log/chrome-extension typecheck
pnpm --filter @impact-log/chrome-extension zip          # сборка + store/impact-log-chrome-<версия>.zip (в .gitignore)
```

`copy-static.mjs` копирует `static/` в `dist/`, ставит версию из `package.json` в manifest и проверяет
результат: все файлы из manifest и html на месте, разрешения ровно `activeTab, contextMenus, scripting,
storage`, ключи локалей совпадают. При ошибке сборка падает.

Иконки (маскот — ретро-монитор с глазами, пиксель-арт) лежат в `static/icons`; перерисовать:
`pnpm --filter @impact-log/chrome-extension icons` (`scripts/icons.mjs`, PNG пишется вручную через
`node:zlib`).

## Установка

1. `chrome://extensions` → включить «Режим разработчика».
2. «Загрузить распакованное расширение» → папка `apps/chrome-extension/dist`.
3. После пересборки — кнопка «Обновить» на карточке расширения.

## Публикация в Chrome Web Store

Расширение: [`jlgeedpgolalalfnecjcjhoflimbfpag`](https://chromewebstore.google.com/detail/jlgeedpgolalalfnecjcjhoflimbfpag).
Скриншоты и промо-плитки — в `store/`. Описание, картинки и ответы на вопросы о приватности меняются
только в кабинете, через API — только пакет.

### Выпуск версии

1. Поднять `version` в `package.json` расширения — магазин не примет версию, которую уже загружали.
2. Закоммитить и поставить тег `chrome-v<версия>`:

   ```sh
   git tag chrome-v0.1.1
   git push origin main chrome-v0.1.1
   ```

3. `.github/workflows/chrome-extension.yml` проверит, что тег совпадает с версией, соберёт zip (он же —
   артефакт запуска), загрузит его через Chrome Web Store API v2 и отправит на проверку. После одобрения
   версия публикуется сама.

Ручной запуск (Actions → Chrome extension → Run workflow, из ветки) по умолчанию только собирает zip.
С `publish` — ещё и загружает и отправляет на проверку, с `staged` — после одобрения ждёт кнопки
«Publish» в кабинете. Пока предыдущая версия на проверке, новая загрузка не пройдёт: дождитесь решения
или отмените проверку в кабинете.

### Разовая настройка доступа

Ключей в GitHub нет: Actions получает токен сервисного аккаунта Google через Workload Identity
Federation (OIDC), а сервисный аккаунт добавлен в кабинет разработчика.

1. Google Cloud (любой свой проект, биллинг не нужен):

   ```sh
   PROJECT_ID=<проект>
   REPO=mxmvshnvsk/impact-log
   gcloud config set project "$PROJECT_ID"
   gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
   gcloud iam service-accounts create cws-publisher --display-name="Chrome Web Store publisher"
   gcloud iam workload-identity-pools create github --location=global --display-name=GitHub
   gcloud iam workload-identity-pools providers create-oidc impact-log \
     --location=global --workload-identity-pool=github \
     --issuer-uri=https://token.actions.githubusercontent.com \
     --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
     --attribute-condition="assertion.repository=='$REPO'"
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
   gcloud iam service-accounts add-iam-policy-binding "cws-publisher@$PROJECT_ID.iam.gserviceaccount.com" \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
   ```

2. Кабинет Chrome Web Store → Account → Service account: добавить `cws-publisher@<проект>.iam.gserviceaccount.com`
   (у издателя может быть только один сервисный аккаунт).
3. GitHub → Settings → Secrets and variables → Actions → **Variables**:

   | Переменная | Значение |
   | --- | --- |
   | `CWS_PUBLISHER_ID` | ID издателя — первый UUID в адресе кабинета `…/devconsole/<ID издателя>/<ID расширения>/…` |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/impact-log` |
   | `GCP_SERVICE_ACCOUNT` | `cws-publisher@<проект>.iam.gserviceaccount.com` |

4. По желанию: Settings → Environments → `chrome-web-store` (создаётся при первом запуске) — обязательное
   подтверждение перед отправкой в магазин или разрешение только для тегов `chrome-v*`.

## Приватность и разрешения

- Никаких сетевых запросов, аналитики и `host_permissions`. Черновик уходит в impact log только
  во **фрагменте** ссылки (после `#`) — браузер не отправляет его на сервер.
- `activeTab` — заголовок, адрес и выделенный текст **текущей** вкладки, и только после вашего клика
  по иконке или пункту меню.
- `scripting` — одноразово прочитать выделенный текст на этой странице (`getSelection()`; поля паролей
  не читаются). Скрипты на страницах не остаются.
- `contextMenus` — пункты «Сохранить … в impact log».
- `storage` — настройки (`sync`) и неотправленный черновик окна расширения (`session`, только в памяти).
- В черновик попадают только `http(s)`-адреса: `file://`, `chrome://` и т.п. не передаются.
