# KlipRun Desktop

A macOS app for OpenCode, Codex, and Claude Code sessions: a Kanban board, embedded terminals, repository file editing and Git diffs, searchable session history, and usage statistics.

## Screenshots

![Kanban](docs/screenshots/kanban.png)

![Kanban with the embedded terminal on the left and session details on the right](docs/screenshots/desktop-terminal.png)

Show or hide the embedded terminal with **⌘J**; click a session card to open its details.

![Office](docs/screenshots/office.png)

![Sessions](docs/screenshots/sessions.png)

![Git Files](docs/screenshots/git-files.png)

![Git Changes](docs/screenshots/git-changes.png)

![Statistics](docs/screenshots/statistics.png)

[More screenshots](docs/screenshots/README.md). All examples use fictional data.

## Install

Requires **Apple Silicon and macOS 13+**.

1. Download `KlipRun-0.0.25-macos-arm64.zip` from the [latest release](https://github.com/klipbn/kliprun_desktop/releases/latest).
2. Unzip and move `KlipRun.app` to **Applications**. Quit KlipRun before replacing an older version.
3. Open the app. If macOS blocks it, use **System Settings → Privacy & Security → Open Anyway**. The build is locally signed and not notarized.

Install and sign in to [OpenCode](https://opencode.ai/), [Codex CLI](https://github.com/openai/codex), or [Claude Code](https://code.claude.com/docs/en/overview) separately. Git requires the macOS command line tools (`xcode-select --install`).

The Claude Code button is immediately to the right of Codex; **⌘⇧A** opens a project picker and starts `claude` in an embedded terminal. Sessions shows Claude history and can resume a chat in its original folder. KlipRun reads `~/.claude/projects` (or `CLAUDE_CONFIG_DIR`) without modifying Claude's configuration or journals. Live cards use confirmed process/session records or open journal descriptors; ambiguous terminals display “Status unknown”. Model, token usage, messages, tool activity, and observed status history appear alongside the other agents. Context bars use recorded model limits or the existing model-limit catalog/overrides; unavailable limits are left blank. Usage and the bottom status bar show remaining 5-hour and weekly Claude subscription limits using the existing OAuth sign-in from macOS Keychain or `.credentials.json`. Renew expired sign-ins in Claude Code; API keys do not expose subscription limits.

In **Sessions**, drag the divider beside All sessions, Favorites, and Projects to resize the sidebar; its width is saved. Hover or focus the running/unread counters or an agent badge in the bottom bar to open a session list, then click a session to view its details. Terminal tabs offer **Rename…**, **Pin / Unpin**, and **Close** on right-click. Pinned tabs collapse to squares with the full title on hover and stay on the left in pin order; the active tab has a thin accent line above it. Closing a running tab ends its process after confirmation.

In **Git → Changes**, drag the divider above the commit box to change its height. **History → Changed files** has its own divider. Focus either divider and use **↑ / ↓** to resize with the keyboard.

Long lines wrap in **Git → Changes**, **History**, and the **Files** source editor without inserting line breaks into the saved file.

In **Git → Files**, `.html` and `.htm` open as highlighted source. The eye button switches between code and the rendered current draft, including unsaved edits. Self-contained HTML can use inline CSS, embedded images, and inline JavaScript; external resources and application access are blocked. Previews unload when hidden or closed. The existing 512 KiB editor limit applies. Use **Open in Default App** for larger reports or pages that need neighboring files or network resources.

## Build

Requires macOS, **Swift 6** (Xcode or Command Line Tools), and [Bun 1.4+](https://bun.sh/).

```sh
git clone https://github.com/klipbn/kliprun_desktop.git
cd kliprun_desktop
zsh scripts/build.sh
open dist/KlipRun.app
```

Run tests:

```sh
zsh scripts/test.sh
cd engine && bun run test
```

[Changelog](CHANGELOG.md) · [MIT license](LICENSE) · Based on [KlipRun](https://github.com/klipbn/kliprun) and [SwiftTerm](vendor/SwiftTerm/LICENSE).
