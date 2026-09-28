# impact log для VS Code

Быстрый захват записей в impact log из редактора. Расширение **не ходит в API и ничего не хранит**:
собирает черновик (`ImpactDraft`, Capture Protocol) и открывает в браузере
`<impactLog.appUrl>/capture#draft=<base64url>`. Там web-клиент показывает форму, вы подтверждаете —
запись шифруется и сохраняется в вашем impact log.

## Команды

| Команда | Что делает |
|---|---|
| **impact log: Capture impact** (`impactLog.capture`) | Запись «с нуля». Если есть выделение — как «Capture selection»; иначе в артефакты попадает текущая ветка |
| **impact log: Capture selection** (`impactLog.captureSelection`) | Также в контекстном меню редактора при выделении. Выделенный код → цитата (до ~2000 символов), постоянная ссылка на файл и строки (`/blob/<sha>/<path>#L10-L20`), ветка |
| **impact log: Capture last commit** (`impactLog.captureCommit`) | Последний коммит (HEAD) репозитория активного файла: тема → заголовок, тело → описание, коммит и ветка → артефакты |

Шаги: заголовок (предзаполнен первой строкой выделения или темой коммита) → влияние 1–5 → метки через
запятую (необязательно). `Esc` на любом шаге — отмена.

Ссылки строятся, если `origin` на GitHub (включая Enterprise), GitLab (включая self-hosted) или bitbucket.org.
Ссылка на строки ставится, только если файл не изменён относительно HEAD (иначе номера строк могут не
совпасть — тогда ссылка на файл целиком). Коммит должен быть запушен, чтобы ссылка открывалась.
Если черновик не помещается в ссылку (16 000 символов), цитата ужимается, о чём расширение скажет.

## Настройки

- `impactLog.appUrl` — адрес impact log, по умолчанию `https://impact-log.com`. Только `https://`
  (для разработки — `http://localhost:5173`). Настройка только пользовательская (`scope: application`):
  рабочая область не может перенаправить черновики на чужой адрес.
- `impactLog.defaultScore` — влияние, выбранное по умолчанию (1–5, по умолчанию 3).

## Сборка и проверка

```sh
pnpm install
pnpm --filter impact-log-vscode build       # tsup → dist/extension.cjs (CommonJS, core внутри, vscode — external)
pnpm --filter impact-log-vscode typecheck
pnpm --filter impact-log-vscode smoke       # бандл с заглушкой vscode: 3 команды + сценарии во временном git-репо
```

## Установка

**VSIX (нужна сеть для `npx`):**

```sh
cd apps/vscode-extension
npx @vscode/vsce package --no-dependencies --skip-license --allow-missing-repository
code --install-extension impact-log-vscode-0.1.0.vsix
```

или в VS Code: Extensions → `…` → **Install from VSIX…**. `--no-dependencies` — всё уже собрано
в один файл; `vscode:prepublish` сам запустит сборку.

**Без сети** — скопировать собранное расширение в папку расширений и перезапустить VS Code:

```sh
pnpm --filter impact-log-vscode build
dest=~/.vscode/extensions/impact-log.impact-log-vscode-0.1.0
mkdir -p "$dest"
cp -R apps/vscode-extension/{package.json,package.nls.json,package.nls.ru.json,l10n,media,dist,README.md} "$dest"/
```

(Windows: `%USERPROFILE%\.vscode\extensions\…`; для Insiders — `~/.vscode-insiders/extensions`.)

Для отладки: открыть `apps/vscode-extension` в VS Code и запустить Extension Development Host
(`F5`, конфигурация «Run Extension» из `.vscode/launch.json`, перед запуском собирает бандл).

## Язык

Команды и настройки — `package.nls.json` / `package.nls.ru.json`, сообщения — `vscode.l10n.t` +
`l10n/bundle.l10n.ru.json`. Язык — как у VS Code (en / ru).

## Приватность

- Никаких сетевых запросов и телеметрии. Черновик передаётся только во **фрагменте** ссылки (после `#`),
  который браузер не отправляет на сервер; открывается через `vscode.env.openExternal`.
- Git вызывается локально (`execFile`, без shell) только для чтения метаданных: корень, HEAD, ветка,
  remote, путь файла. Логин/токен из https-remote в ссылки не попадает, абсолютные пути файлов —
  тоже (только путь от корня репозитория или рабочей области).
- В Restricted Mode (недоверенная рабочая область) git не запускается вовсе.
- Цитата — только то, что вы явно выделили.
