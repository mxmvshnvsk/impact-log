/**
 * Сообщения CLI: en по умолчанию, ru — если LC_ALL / LC_MESSAGES / LANG начинается с «ru».
 * Название продукта «impact log» не переводится.
 */
export type Locale = 'en' | 'ru'

export function detectLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const value = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  return value.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

const en = {
  'help.main': `impact — quick capture for impact log

Usage:
  impact add [title…] [options]      Capture what you did and its impact
  impact git [--rev <rev>] [options] Capture a commit (HEAD by default)
  impact config <get|set|unset|path> [app-url] [value]
  impact decode <link>               Show the draft inside a capture link
  impact --help | --version

The CLI makes no network requests. It builds a draft and opens
<app-url>/capture#draft=… in your browser: the part after # never leaves
your machine, and the entry is encrypted once you confirm it in impact log.

Run "impact <command> --help" for command options.`,
  'help.add': `Usage: impact add [title…] [options]

Without a title in an interactive terminal, impact asks for the title and score.

Options:
  -s, --score <1-5>          Impact: 1 small win … 5 key result of the year
  -c, --category <name>      Category (repeatable)
  -l, --label <name>         Label (repeatable; commas work too: -l ci,perf)
      --link <url>           PR, issue, commit or doc link (repeatable)
  -m, --metric <spec>        "Label=value unit" or "Label=before->after unit" (repeatable)
      --date <YYYY-MM-DD>    When it happened (default: today)
  -d, --description <text>   Description (Markdown)
      --stdin                Read the description from stdin
      --print                Print only the link, don't open the browser
      --json                 Print the draft as JSON, don't open the browser
      --no-open              Don't open the browser, print the link
      --app-url <url>        impact log address (see "impact config --help")
  -h, --help                 Show this help

Examples:
  impact add "Sped up CI" -s 4 -c Performance -l ci \\
    --link https://github.com/org/repo/pull/42 -m "Build time=12->4 min"
  git log -1 --format=%b | impact add "Migrated to Node 22" --stdin`,
  'help.git': `Usage: impact git [--rev <rev>] [options]

Builds a draft from a commit: subject → title, body → description,
commit and branch → evidence (links if origin is on GitHub, GitLab or Bitbucket).

Options:
      --rev <rev>            Commit to capture (default: HEAD)
  -s, --score <1-5>          Impact: 1 small win … 5 key result of the year
  -c, --category <name>      Category (repeatable)
  -l, --label <name>         Label (repeatable)
      --link <url>           Extra link: PR, issue, doc (repeatable)
  -m, --metric <spec>        "Label=value unit" or "Label=before->after unit" (repeatable)
      --date <YYYY-MM-DD>    When it happened (default: commit date)
      --print                Print only the link, don't open the browser
      --json                 Print the draft as JSON, don't open the browser
      --no-open              Don't open the browser, print the link
      --app-url <url>        impact log address
  -h, --help                 Show this help

Example:
  impact git --rev HEAD~1 -s 3 -l refactoring`,
  'help.config': `Usage:
  impact config get [app-url]        Show the effective value (and where it comes from)
  impact config set app-url <url>    Save the impact log address
  impact config unset app-url        Forget the saved address
  impact config path                 Print the config file path

App URL priority: --app-url > IMPACT_LOG_URL > config > https://impact-log.com
http:// is allowed only for localhost, e.g. http://localhost:5173 for development.`,
  'help.decode': `Usage: impact decode <link | #draft=… | ->

Prints the draft carried by a capture link as JSON (validated, offline).
"-" reads the link from stdin.`,

  'error.prefix': 'error',
  'warning.prefix': 'warning',
  'error.unknownCommand': 'unknown command "{command}". Run "impact --help".',
  'error.args': '{message}. Run "impact {command} --help".',
  'error.unknownOption': 'unknown option {option}',
  'error.optionValue': 'option {option} needs a value',
  'error.unexpectedArg': 'unexpected argument "{arg}"',
  'error.score': 'score must be a whole number from 1 to 5, got "{value}"',
  'error.date': 'date must be a real date in YYYY-MM-DD format, got "{value}"',
  'error.metric':
    'can\'t parse metric "{value}": use "Label=value unit" or "Label=before->after unit", e.g. "Build time=12->4 min"',
  'error.link': 'not a valid http(s) link: "{value}"',
  'error.appUrl':
    'invalid impact log address "{value}": use https://… (http:// only for localhost), without query, # and special characters',
  'error.titleRequired': 'a title is required',
  'error.titleTooLong': 'the title is too long: {length} of {max} characters',
  'error.descriptionTooLong': 'the description is too long: {length} of {max} characters',
  'error.empty': 'nothing to capture: add a title, e.g. impact add "Sped up CI"',
  'error.descriptionConflict': 'use either --description or --stdin, not both',
  'error.tooLarge':
    'the draft is too large for a link: {length} of {max} characters. Shorten the description (or the commit message) or remove some links and metrics.',
  'error.invalidDraft': 'the draft is invalid — {details}',
  'error.notGitRepo': 'not a git repository: run "impact git" inside a repository',
  'error.gitMissing': 'git is not installed or not in PATH',
  'error.unknownRev': 'unknown revision "{rev}"',
  'error.git': 'git failed: {message}',
  'error.configKey': 'unknown config key "{key}". Available: app-url',
  'error.configUsage': 'usage: impact config <get|set|unset|path> [app-url] [value]',
  'error.configRead': "can't read the config {path}: {message}",
  'error.configWrite': "can't write the config {path}: {message}",
  'error.cancelled': 'cancelled',
  'error.decode': 'no valid draft found in the link',
  'error.decodeUsage': 'usage: impact decode <link>',
  'error.unexpected': 'unexpected error: {message}',

  'prompt.title': 'What did you do? ',
  'prompt.scoreLegend':
    'Impact: 1 small win · 2 helpful · 3 noticeable · 4 major · 5 key result of the year',
  'prompt.score': 'Impact 1–5 [{default}]: ',
  'prompt.scoreInvalid': 'Enter a number from 1 to 5.',
  'prompt.stdinHint': 'Type the description, finish with Ctrl+D:',

  'handoff.opened': 'Opened impact log in your browser — review the entry and save it there.',
  'handoff.openManually': 'Open this link to review and save the entry:',
  'handoff.openFailed': "couldn't open a browser ({message}). Open this link manually:",

  'config.saved': 'Saved {key} = {value} ({path})',
  'config.removed': 'Removed {key} ({path})',
  'config.source.flag': 'from --app-url',
  'config.source.env': 'from IMPACT_LOG_URL',
  'config.source.config': 'from {path}',
  'config.source.default': 'default',
}

export type MessageKey = keyof typeof en

const ru: Record<MessageKey, string> = {
  'help.main': `impact — быстрый захват записей в impact log

Использование:
  impact add [заголовок…] [опции]    Записать, что сделано и какой эффект
  impact git [--rev <rev>] [опции]   Запись из коммита (по умолчанию HEAD)
  impact config <get|set|unset|path> [app-url] [значение]
  impact decode <ссылка>             Показать черновик из ссылки захвата
  impact --help | --version

CLI не делает сетевых запросов. Он собирает черновик и открывает в браузере
<app-url>/capture#draft=…: часть после # не покидает ваш компьютер, а запись
шифруется, когда вы подтвердите её в impact log.

Опции команды: "impact <команда> --help".`,
  'help.add': `Использование: impact add [заголовок…] [опции]

Без заголовка в интерактивном терминале impact спросит заголовок и оценку.

Опции:
  -s, --score <1-5>          Влияние: 1 заметная мелочь … 5 ключевой результат года
  -c, --category <имя>       Категория (можно повторять)
  -l, --label <имя>          Метка (можно повторять; можно через запятую: -l ci,perf)
      --link <url>           Ссылка на PR, задачу, коммит, документ (можно повторять)
  -m, --metric <метрика>     "Название=значение ед." или "Название=было->стало ед." (можно повторять)
      --date <ГГГГ-ММ-ДД>    Когда это произошло (по умолчанию сегодня)
  -d, --description <текст>  Описание (Markdown)
      --stdin                Прочитать описание из stdin
      --print                Только вывести ссылку, не открывать браузер
      --json                 Вывести черновик в JSON, не открывать браузер
      --no-open              Не открывать браузер, вывести ссылку
      --app-url <url>        Адрес impact log (см. "impact config --help")
  -h, --help                 Эта справка

Примеры:
  impact add "Ускорил сборку" -s 4 -c Performance -l ci \\
    --link https://github.com/org/repo/pull/42 -m "Время сборки=12->4 мин"
  git log -1 --format=%b | impact add "Перевёл сервис на Node 22" --stdin`,
  'help.git': `Использование: impact git [--rev <rev>] [опции]

Черновик из коммита: тема → заголовок, тело → описание, коммит и ветка → артефакты
(ссылками, если origin на GitHub, GitLab или Bitbucket).

Опции:
      --rev <rev>            Какой коммит (по умолчанию HEAD)
  -s, --score <1-5>          Влияние: 1 заметная мелочь … 5 ключевой результат года
  -c, --category <имя>       Категория (можно повторять)
  -l, --label <имя>          Метка (можно повторять)
      --link <url>           Дополнительная ссылка: PR, задача, документ (можно повторять)
  -m, --metric <метрика>     "Название=значение ед." или "Название=было->стало ед." (можно повторять)
      --date <ГГГГ-ММ-ДД>    Когда это произошло (по умолчанию дата коммита)
      --print                Только вывести ссылку, не открывать браузер
      --json                 Вывести черновик в JSON, не открывать браузер
      --no-open              Не открывать браузер, вывести ссылку
      --app-url <url>        Адрес impact log
  -h, --help                 Эта справка

Пример:
  impact git --rev HEAD~1 -s 3 -l refactoring`,
  'help.config': `Использование:
  impact config get [app-url]        Показать действующее значение (и откуда оно)
  impact config set app-url <url>    Сохранить адрес impact log
  impact config unset app-url        Забыть сохранённый адрес
  impact config path                 Путь к файлу конфигурации

Приоритет адреса: --app-url > IMPACT_LOG_URL > конфиг > https://impact-log.com
http:// разрешён только для localhost, например http://localhost:5173 для разработки.`,
  'help.decode': `Использование: impact decode <ссылка | #draft=… | ->

Выводит черновик из ссылки захвата в JSON (с проверкой схемы, без сети).
"-" — прочитать ссылку из stdin.`,

  'error.prefix': 'ошибка',
  'warning.prefix': 'внимание',
  'error.unknownCommand': 'неизвестная команда "{command}". Справка: "impact --help".',
  'error.args': '{message}. Справка: "impact {command} --help".',
  'error.unknownOption': 'неизвестная опция {option}',
  'error.optionValue': 'опции {option} нужно значение',
  'error.unexpectedArg': 'лишний аргумент "{arg}"',
  'error.score': 'оценка — целое число от 1 до 5, получено "{value}"',
  'error.date': 'дата — реальная дата в формате ГГГГ-ММ-ДД, получено "{value}"',
  'error.metric':
    'не удалось разобрать метрику "{value}": используйте "Название=значение ед." или "Название=было->стало ед.", например "Время сборки=12->4 мин"',
  'error.link': 'это не http(s)-ссылка: "{value}"',
  'error.appUrl':
    'неверный адрес impact log "{value}": нужен https://… (http:// — только для localhost), без query, # и спецсимволов',
  'error.titleRequired': 'нужен заголовок',
  'error.titleTooLong': 'слишком длинный заголовок: {length} из {max} символов',
  'error.descriptionTooLong': 'слишком длинное описание: {length} из {max} символов',
  'error.empty': 'нечего записывать: добавьте заголовок, например impact add "Ускорил сборку"',
  'error.descriptionConflict': 'используйте либо --description, либо --stdin',
  'error.tooLarge':
    'черновик не помещается в ссылку: {length} из {max} символов. Сократите описание (или сообщение коммита) либо уберите часть ссылок и метрик.',
  'error.invalidDraft': 'черновик не прошёл проверку — {details}',
  'error.notGitRepo': 'это не git-репозиторий: запустите "impact git" внутри репозитория',
  'error.gitMissing': 'git не установлен или его нет в PATH',
  'error.unknownRev': 'неизвестная ревизия "{rev}"',
  'error.git': 'ошибка git: {message}',
  'error.configKey': 'неизвестный ключ "{key}". Доступен: app-url',
  'error.configUsage': 'использование: impact config <get|set|unset|path> [app-url] [значение]',
  'error.configRead': 'не удалось прочитать конфиг {path}: {message}',
  'error.configWrite': 'не удалось записать конфиг {path}: {message}',
  'error.cancelled': 'отменено',
  'error.decode': 'в ссылке нет корректного черновика',
  'error.decodeUsage': 'использование: impact decode <ссылка>',
  'error.unexpected': 'непредвиденная ошибка: {message}',

  'prompt.title': 'Что сделали? ',
  'prompt.scoreLegend':
    'Влияние: 1 заметная мелочь · 2 полезно · 3 ощутимо · 4 сильное · 5 ключевой результат года',
  'prompt.score': 'Влияние 1–5 [{default}]: ',
  'prompt.scoreInvalid': 'Введите число от 1 до 5.',
  'prompt.stdinHint': 'Введите описание, завершите Ctrl+D:',

  'handoff.opened': 'impact log открыт в браузере — проверьте запись и сохраните её там.',
  'handoff.openManually': 'Откройте ссылку, чтобы проверить и сохранить запись:',
  'handoff.openFailed': 'не удалось открыть браузер ({message}). Откройте ссылку вручную:',

  'config.saved': 'Сохранено: {key} = {value} ({path})',
  'config.removed': 'Удалено: {key} ({path})',
  'config.source.flag': 'из --app-url',
  'config.source.env': 'из IMPACT_LOG_URL',
  'config.source.config': 'из {path}',
  'config.source.default': 'по умолчанию',
}

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ru }

let locale: Locale = detectLocale()

export function setLocale(value: Locale): void {
  locale = value
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
