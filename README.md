# KlipRun Desktop

A macOS app for OpenCode and Codex sessions: a Kanban board, embedded terminals, Git diffs, searchable session history, and usage statistics.

## Screenshots

![Kanban, Recent Sessions, and session details](docs/screenshots/recent-sessions.png)

![Git changes and diff](docs/screenshots/git-changes.png)

![Office view](docs/screenshots/office.png)

[More screenshots](docs/screenshots/README.md), including terminals and statistics. All examples use fictional data.

## Install

Requires **Apple Silicon and macOS 13+**.

1. Download `KlipRun-0.0.16-macos-arm64.zip` from the [latest release](https://github.com/klipbn/kliprun_desktop/releases/latest).
2. Unzip and move `KlipRun.app` to **Applications**. Quit KlipRun before replacing an older version.
3. Open the app. If macOS blocks it, use **System Settings → Privacy & Security → Open Anyway**. The build is locally signed and not notarized.

Install and sign in to [OpenCode](https://opencode.ai/) or [Codex CLI](https://github.com/openai/codex) separately. Git requires the macOS command line tools (`xcode-select --install`).

Starting with 0.0.16, use **Check for Updates → Download Update → Install and Restart**. KlipRun verifies and prepares the update, replaces its current copy, and reopens with **What's New**. No manual ZIP extraction or copying is needed for subsequent updates. Upgrading from 0.0.15 or earlier still requires the installation steps above once. The app must be in a writable folder. Restarting asks before ending agents running in embedded terminals; preferences and session history are preserved.

The **Git** repository menu supports search by name or path and keyboard selection. **Statistics → Latest sessions** shows the latest 5, 10, 20, or 50 sessions within the selected period and filters, including subagents, token breakdowns, observed time, calls, and recorded costs. The chosen count is remembered. **Cached input** means tokens read from the cache; it is separate from uncached input and cache writes, so totals do not double-count tokens.

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
