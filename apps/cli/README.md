# impact CLI

Быстрый захват записей в impact log из терминала. CLI **не ходит в API и ничего не хранит**:
он собирает черновик (`ImpactDraft`, Capture Protocol) и открывает в браузере
`<app-url>/capture#draft=<base64url>`. Страница `/capture` показывает форму с заполненными полями,
вы проверяете и подтверждаете — запись шифруется и сохраняется в вашем impact log.

## Установка

Нужен Node.js ≥ 22.

```sh
pnpm install
pnpm --filter @impact-log/cli build      # → apps/cli/dist/impact.js (один файл, без зависимостей)
cd apps/cli && npm link                  # команда `impact` в PATH
```

Без `npm link` — симлинк или алиас:

```sh
ln -s "$PWD/apps/cli/dist/impact.js" ~/.local/bin/impact
# или
alias impact="node $PWD/apps/cli/dist/impact.js"
```

## Примеры

```sh
# Всё флагами
impact add "Ускорил сборку" -s 4 -c Performance -l ci \
  --link https://github.com/org/repo/pull/42 -m "Время сборки=12->4 мин"

# Интерактивно: без заголовка в терминале impact спросит заголовок и оценку
impact add

# Описание из stdin
git log -1 --format=%b | impact add "Перевёл сервис на Node 22" --stdin

# Из коммита: тема → заголовок, тело → описание, коммит и ветка → артефакты
impact git
impact git --rev HEAD~2 -s 3 -l refactoring

# Только ссылка / черновик в JSON (браузер не открывается)
impact add "Разобрал инцидент" --print
impact add "Разобрал инцидент" --json

# Что лежит в ссылке захвата (офлайн, со схемной проверкой)
impact decode "https://impact-log.com/capture#draft=eyJ…"
```

Флаги `add`: `-s/--score 1..5`, `-c/--category` и `-l/--label` (повторяемые, можно через запятую),
`--link <url>` (повторяемый; тип определяется автоматически: PR, задача, коммит, документ),
`-m/--metric "Название=значение ед."` или `"Название=было->стало ед."`, `--date ГГГГ-ММ-ДД`,
`-d/--description` или `--stdin`, `--print`, `--json`, `--no-open`, `--app-url`.
Полная справка: `impact --help`, `impact add --help`, `impact git --help`.

`impact git` понимает remote в форматах `git@host:org/repo.git`, `ssh://…`, `https://…` для GitHub
(включая Enterprise и `ssh.github.com:443`), GitLab (включая self-hosted и подгруппы) и bitbucket.org.
Если origin на другом хостинге — коммит попадает в запись без ссылки, по SHA. Ссылка на ветку ставится,
только если у ветки есть upstream на том же remote.

Коды выхода: `0` — успех, `1` — ошибка ввода (флаги, валидация, не git-репозиторий, черновик
не помещается в ссылку), `2` — прочее (файл конфигурации, git упал).

Язык сообщений — английский, русский при `LANG`/`LC_ALL`, начинающемся с `ru`.

## Конфигурация

```sh
impact config set app-url http://localhost:5173   # локальная разработка
impact config get                                  # действующее значение и его источник
impact config unset app-url
impact config path
```

Файл: `$XDG_CONFIG_HOME/impact-log/config.json` (по умолчанию `~/.config/impact-log/config.json`),
на Windows — `%APPDATA%\impact-log\config.json`. Права 600.

Приоритет адреса: `--app-url` > переменная `IMPACT_LOG_URL` > конфиг > `https://impact-log.com`.
Разрешён только `https://` (для `localhost`, `127.0.0.1`, `[::1]` и `*.localhost` — и `http://`), без
логина/пароля в адресе, query и `#`. Хост — только латинские буквы, цифры, точки и дефисы (плюс порт;
для localhost — ещё `[::1]`), путь — без спецсимволов (`A–Z a–z 0–9 . _ ~ / -`): `new URL` пропускает в
имени хоста `&`, `"`, `(` и т.п., а адрес потом уходит внешней программе открытия браузера. Неподходящий
адрес — ошибка ввода (код выхода 1).

## Приватность

- Никаких сетевых запросов и телеметрии. CLI только открывает ссылку в браузере: `open` (macOS),
  `xdg-open` (Linux), `rundll32 url.dll,FileProtocolHandler <url>` (Windows) — без shell, URL отдельным
  аргументом. Не `cmd /c start`: cmd разбирает строку сам, и `&`, `|`, `^` в URL стали бы командами.
- Черновик лежит во **фрагменте** ссылки (после `#`) — браузер не отправляет его на сервер,
  он не попадает в логи. Web-клиент читает его локально и шифрует запись после подтверждения.
- Ссылка с черновиком может остаться в истории браузера (как любой URL), но не на сервере.
- `impact git` читает только метаданные коммита через локальный `git`; логин/токен из https-remote
  в ссылки не попадает. Локальные пути файлов в черновик не пишутся.
- Длина ссылки ограничена `MAX_HANDOFF_LENGTH` (16 000 символов) — если описание не помещается,
  CLI скажет сократить его.
