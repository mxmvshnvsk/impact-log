# impact log for VS Code

Capture what you did — and the impact it had — without leaving the editor. Select code, run a command,
and a draft opens in your [impact log](https://impact-log.com) with the title, impact score, labels,
a permalink to the exact lines, the commit and the branch already filled in. Review it there and save.

![“Capture selection” in the editor context menu](https://impact-log.com/media/vscode/capture-selection.png)

## Commands

| Command | What it does |
| --- | --- |
| **impact log: Capture selection** | Also in the editor context menu. The selected code becomes a quote, plus a permalink to the file and lines (`…/blob/<sha>/<path>#L16-L27`) and the current branch. |
| **impact log: Capture last commit** | The last commit of the active file's repository: subject → title, body → description, commit and branch → artifacts. |
| **impact log: Capture impact** | A blank entry. With a selection it works like *Capture selection*, otherwise the current branch is attached. |

Three quick steps: title (prefilled from the selection or the commit subject) → impact from 1 to 5 →
labels (optional). `Esc` cancels at any step.

![Choosing the impact score](https://impact-log.com/media/vscode/impact-score.png)

The draft opens in the browser: check it and press **Save**. The entry keeps the link to the lines,
the quote and the branch, so a year later you can still show exactly what you did.

![The saved entry in impact log](https://impact-log.com/media/vscode/entry.png)

Links are built when `origin` points to GitHub (including Enterprise), GitLab (including self-hosted)
or bitbucket.org. A link to specific lines is used only if the file is unchanged against `HEAD`,
otherwise the whole file is linked. Push the commit so that the link opens.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `impactLog.appUrl` | `https://impact-log.com` | Your impact log address. `https://` only (`http://localhost…` for development). User setting only — a workspace can't redirect your drafts. |
| `impactLog.defaultScore` | `3` | Impact preselected when capturing, 1–5. |

## Privacy

- The extension makes no network requests and has no telemetry. The draft travels only in the link
  fragment (after `#`), which the browser never sends to a server.
- Git runs locally and only reads metadata: repository root, `HEAD`, branch, remote, file path.
  Credentials from https remotes and absolute file paths never end up in links.
- In Restricted Mode git isn't used at all. The quote is only what you explicitly selected.
- impact log itself encrypts entries in your browser; with sync on, the server only gets ciphertext.
  What is stored where: [impact-log.com/principles](https://impact-log.com/principles).

The interface follows VS Code's display language — English or Russian.

## По-русски

Записывайте, что сделали и какой был эффект, прямо из редактора: выделите код и выберите
**impact log: Capture selection** (есть в контекстном меню) или **Capture last commit**. Черновик с
заголовком, оценкой влияния, метками, ссылкой на строки кода, коммитом и веткой откроется в impact log —
проверьте и сохраните. Расширение не делает сетевых запросов: черновик передаётся во фрагменте ссылки.
Интерфейс на русском, если VS Code на русском.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)
