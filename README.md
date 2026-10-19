# KlipRun Desktop

A macOS app for OpenCode, Codex, and Claude Code sessions: a Kanban board, embedded terminals, repository file editing and Git diffs, searchable session history, and usage statistics.

## Screenshots

![Kanban](docs/screenshots/kanban.png)

![Kanban with the embedded terminal on the left and session details on the right](docs/screenshots/desktop-terminal.png)

Show or hide the embedded terminal with **⌘J**; click a session card to open its details.
Kanban cards use neutral outlines; column headings and card icons show their status.

Click **Show labels** at the right edge of the top toolbar to expand it: agent
and utility buttons show their names on the first row, and workspace views move
to a second row. **Hide labels** returns to compact icons. The app remembers the
choice across refreshes and restarts; new installations start compact. In Office,
use **Kanban** in this toolbar to return to the board.

![Office](docs/screenshots/office.png)

![Sessions](docs/screenshots/sessions.png)

![Git Files](docs/screenshots/git-files.png)

![Git Changes](docs/screenshots/git-changes.png)

![Statistics](docs/screenshots/statistics.png)

[More screenshots](docs/screenshots/README.md). All examples use fictional data.

## Install

Requires **Apple Silicon and macOS 13+**.

1. Download `KlipRun-0.0.28-macos-arm64.zip` from the [latest release](https://github.com/klipbn/kliprun_desktop/releases/latest).
2. Unzip and move `KlipRun.app` to **Applications**. Quit KlipRun before replacing an older version.
3. Open the app. If macOS blocks it, use **System Settings → Privacy & Security → Open Anyway**. The build is locally signed and not notarized.

Install and sign in to [OpenCode](https://opencode.ai/), [Codex CLI](https://github.com/openai/codex), or [Claude Code](https://code.claude.com/docs/en/overview) separately. Git requires the macOS command line tools (`xcode-select --install`).

The Claude Code button is immediately to the right of Codex; **⌘⇧A** opens a project picker and starts `claude` in an embedded terminal. Sessions shows Claude history and can resume a chat in its original folder. Working in a subdirectory keeps the original project folder and live session link. KlipRun reads `~/.claude/projects` (or `CLAUDE_CONFIG_DIR`) without modifying Claude's configuration or journals. Live cards use confirmed process/session records or open journal descriptors; ambiguous terminals display “Status unknown”. Model, token usage, messages, tool activity, and observed status history appear alongside the other agents. Context bars use recorded model limits or the existing model-limit catalog/overrides; unavailable limits are left blank. Usage and the bottom status bar show remaining 5-hour and weekly Claude subscription limits using the existing OAuth sign-in from macOS Keychain or `.credentials.json`. Renew expired sign-ins in Claude Code; API keys do not expose subscription limits.

In **Sessions**, drag the divider beside All sessions, Favorites, and Projects to resize the sidebar; its width is saved. Hover or focus the running/unread counters or an agent badge in the bottom bar to open a session list, then click a session to view its details. Terminal tabs offer **Rename…**, **Pin / Unpin**, and **Close** on right-click. Pinned tabs collapse to squares with the full title on hover and stay on the left in pin order; the active tab has a thin accent line above it. Closing a running tab ends its process after confirmation.

If Sessions cannot refresh after a temporary history-index startup failure, **Retry** or the next automatic refresh restarts the history service. Saved projects, groups, and favorites are preserved.

Click the terminal icon at the far left of the terminal tab bar to open a scrollable list of all open terminal tabs. Each row shows its number, title, project folder, running indicator, and pin state; a checkmark identifies the active tab. Numbers follow the current tab order, including pinned and reordered tabs. The first nine show their **⌘1–9** shortcuts; later tabs remain available by clicking. Choosing a row switches to that terminal and its linked session and closes the list.

When terminal tabs overflow, scroll over the tab strip with the mouse wheel to move through them without holding Shift. Horizontal trackpad gestures also work.

**Settings → Agents**, between Notifications and Updates, saves Model, CLI path, and Launch arguments separately for OpenCode, Codex, and Claude Code. Changes apply to new and resumed sessions. Empty fields keep automatic launching, including `codex-vk` when available. CLI paths support `~/` and paths with spaces; Choose… selects a binary or wrapper. OpenCode models use `provider/model`; the other agents accept their CLI's model IDs or aliases. Quote argument values containing spaces; environment variables and shell commands are passed as literal text. Invalid quoting appears beside the agent's settings and prevents launching until corrected. Reset restores automatic settings for that agent.

**Usage** combines live subscription limits with recorded local token history. Choose Today, Last 7 days, Last 30 days, or All time and filter history by agent. Compare token totals, model calls, input cache share, and tokens per call; explore token categories, daily/monthly trends, leading models/projects, and the five most token-intensive tasks with their subagents. Charts and breakdowns open filtered Statistics; task rows open the existing statistics detail. Provider cards show plan, every limit window, remaining allowance, freshness, and resets independently of the history period. Cached/expired reports and partial or unavailable history stay marked. The layout follows the available pane width when the terminal dock is open.

Normal Claude subscription checks reuse a successful report for five minutes; other providers use one minute. HTTP 429 pauses upstream checks for 5, 10, 20, then 30 minutes on repeated failures, or longer when the provider's `Retry-After` requires it. Refresh respects that pause, and Usage shows when retry becomes available. Existing balances stay marked as cached. Token-history charts read local records and do not call the provider's model or usage API.

In **Git → Changes**, drag the divider above the commit box to change its height. **History → Changed files** has its own divider. Focus either divider and use **↑ / ↓** to resize with the keyboard.

Git remembers each repository's active tab, open file tabs and active file, Files filter and expanded folders, selected Changes diff and whether it was closed. List/Tree, sorting, and grouping also survive application restarts. Collapsed folders, including **Collapse all folders**, stay collapsed when switching tabs, leaving Git, refreshing, or reopening the app. Restored file tabs read their current contents from disk; existing unsaved-edit checks still apply.

Long lines wrap in **Git → Changes**, **History**, and the **Files** source editor without inserting line breaks into the saved file.

In **Git → Files**, `.html` and `.htm` open as highlighted source. The eye button switches between code and the rendered current draft, including unsaved edits. Self-contained HTML can use inline CSS, embedded images, and inline JavaScript; external resources and application access are blocked. Previews unload when hidden or closed. The existing 512 KiB editor limit applies. Use **Open in Default App** for larger reports or pages that need neighboring files or network resources.

Files also marks added, modified, and deleted lines beside the line numbers.
Click a marker to review the committed **HEAD** text and the current draft, with
changed words highlighted. **Show changes** opens every block; **Escape** or
**Hide changes** collapses them. Review includes staged, unstaged, and unsaved
edits and does not stage, revert, or save anything. Baselines refresh after a
repository refresh or a HEAD change, while preserving the editor's undo history.
Clean open files also follow disk updates on the repository's regular refresh;
an unsaved draft is never replaced by an agent's changes.
Diffs above the 512 KiB limit show a notice; the file editor keeps its existing limits.

**Git → Files** loads the repository root first and folder contents when expanded.
Large folders and search results offer **Load more**; browsing is no longer cut
off at 10,000 repository paths. **Filter files** searches paths throughout the
repository, including unopened folders, and follows the ignored-files setting.

Ignored files and folders are visible with muted names. **Hide ignored files**
and **Show ignored files** control their visibility; the choice is saved per
repository. Folders containing tracked files remain accessible when ignored
entries are hidden. Regular
ignored text files can be opened and saved, but do not receive Git change marks.
The existing checks for symlinks, Git metadata, nested repositories, and concurrent
file edits still apply.

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
