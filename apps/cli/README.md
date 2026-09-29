# impact log CLI

Capture what you did — and the impact it had — right from the terminal. `impact` builds a draft and
opens it in your [impact log](https://impact-log.com): check it there and save. From a commit it takes
the subject, the body and links to the commit and the branch.

```sh
npm install --global impact-log
impact add "Sped up CI" -s 4 --link https://github.com/org/repo/pull/42 -m "Build time=12->4 min"
```

Or without installing: `npx impact-log add "Sped up CI"`. Requires Node.js 22 or newer.

## Examples

```sh
# Everything with flags
impact add "Sped up CI" -s 4 -c Performance -l ci \
  --link https://github.com/org/repo/pull/42 -m "Build time=12->4 min"

# Interactive: without a title in a terminal, impact asks for the title and the score
impact add

# Description from stdin
git log -1 --format=%b | impact add "Migrated the service to Node 22" --stdin

# From a commit: subject → title, body → description, commit and branch → artifacts
impact git
impact git --rev HEAD~2 -s 3 -l refactoring

# Just the link or the draft as JSON (the browser is not opened)
impact add "Led the incident review" --print
impact add "Led the incident review" --json

# What's inside a capture link (offline, validated)
impact decode "https://impact-log.com/capture#draft=eyJ…"
```

## Commands

| Command | What it does |
| --- | --- |
| `impact add [title…]` | Capture what you did and its impact |
| `impact git [--rev <rev>]` | Capture a commit (`HEAD` by default) |
| `impact decode <link>` | Print the draft inside a capture link as JSON; `-` reads the link from stdin |
| `impact config get \| set \| unset \| path` | Your impact log address (see below) |

Options of `add` (and mostly of `git`):

| Option | |
| --- | --- |
| `-s, --score <1-5>` | Impact: 1 small win … 5 key result of the year |
| `-c, --category <name>` | Category, repeatable |
| `-l, --label <name>` | Label, repeatable; commas work too: `-l ci,perf` |
| `--link <url>` | PR, issue, commit or doc link, repeatable; the type is detected automatically |
| `-m, --metric <spec>` | `"Label=value unit"` or `"Label=before->after unit"`, repeatable |
| `--date <YYYY-MM-DD>` | When it happened (default: today; for `git` — the commit date) |
| `-d, --description <text>`, `--stdin` | Description (Markdown) |
| `--print`, `--json`, `--no-open` | Print the link or the draft instead of opening the browser |
| `--app-url <url>` | impact log address for this run |

Full help: `impact --help`, `impact add --help`, `impact git --help`.

`impact git` builds links when `origin` points to GitHub (including Enterprise), GitLab (including
self-hosted and subgroups) or bitbucket.org; otherwise the commit is kept by its SHA. A branch link is
added only if the branch has an upstream on the same remote.

Exit codes: `0` — success, `1` — invalid input (flags, validation, not a git repository, the draft
doesn't fit into a link), `2` — anything else (config file, git failed).

## Configuration

```sh
impact config set app-url http://localhost:5173   # e.g. a local impact log
impact config get                                  # the effective value and where it comes from
impact config unset app-url
impact config path
```

The address is taken from `--app-url`, then `IMPACT_LOG_URL`, then the config file, and defaults to
`https://impact-log.com`. Only `https://` is allowed (`http://` only for `localhost`). The config lives
in `$XDG_CONFIG_HOME/impact-log/config.json` (`~/.config/impact-log/config.json`; on Windows
`%APPDATA%\impact-log\config.json`) with permissions 600.

Messages are in English, or in Russian when `LANG`/`LC_ALL` starts with `ru`.

## Privacy

- No network requests and no telemetry. The CLI only opens a link in your browser (`open`, `xdg-open`
  or `rundll32` on Windows — without a shell, the URL as a separate argument).
- The draft travels in the link fragment (after `#`), which the browser never sends to a server. The link
  may stay in your browser history, like any address.
- `impact git` reads only commit metadata with your local `git`. Credentials from https remotes and local
  file paths never end up in the draft.
- impact log itself encrypts entries in your browser; with sync on, the server only gets ciphertext.
  What is stored where: [impact-log.com/principles](https://impact-log.com/principles).

## По-русски

Записывайте, что сделали и какой был эффект, прямо из терминала: `impact add "Ускорил сборку" -s 4` или
`impact git` для последнего коммита. Черновик откроется в impact log — проверьте и сохраните. CLI не
делает сетевых запросов: черновик передаётся во фрагменте ссылки. Сообщения на русском, если `LANG`
начинается с `ru`. Установка: `npm install --global impact-log`.

## Development

In the impact log monorepo:

```sh
pnpm install
pnpm --filter impact-log build    # → apps/cli/dist/impact.js, one self-contained file
pnpm --filter impact-log smoke    # the main scenarios against the built CLI
node apps/cli/dist/impact.js --help
```

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)
