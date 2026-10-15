# KlipRun Desktop

KlipRun is a macOS app for following OpenCode and Codex sessions in one place. It shows a Kanban board, an animated Office view, usage statistics, notifications, and live terminal tabs for agents you start inside the app.

## Install

The downloadable build is for **Apple Silicon Macs running macOS 13 or newer**.

1. Download `KlipRun-0.0.2-macos-arm64.zip` from the [latest release](https://github.com/klipbn/kliprun_desktop/releases/latest).
2. Unzip it and move `KlipRun.app` to **Applications**.
3. Open the app. The release is signed locally but is not notarized, so macOS may block the first launch. If it does, go to **System Settings → Privacy & Security → Open Anyway**, then open KlipRun again.

Install and sign in to [OpenCode](https://opencode.ai/) or [Codex CLI](https://github.com/openai/codex) separately. KlipRun does not include either CLI or its credentials.

## Use

- **Kanban** shows active sessions and those needing attention. Click a card to inspect its activity.
- **Running** keeps cards in arrival order while they stay in the column; new arrivals appear at the bottom.
- **Recent Sessions** on the left lists the latest 50 top-level sessions. Click a title for details or **Resume in Terminal** to continue the same Codex or OpenCode session in its original folder. An existing matching tab is selected when available. The panel remembers whether it is collapsed.
- **Office** shows the same agents as animated coworkers. **Statistics** shows usage over time.
- **New OpenCode** and **New Codex** ask you to choose a project folder, then start the agent in a terminal tab at the bottom.
- **⌘T** lets you choose OpenCode, Codex, or a plain terminal. A plain terminal opens in the selected tab's folder, or your home folder when no tab is selected.
- Click **Terminal** to show or hide the terminal area. Tabs keep running while hidden. Closing an active tab or quitting the app asks before ending its process.
- Exiting an agent or shell automatically closes its terminal tab. The terminal area hides after the last tab exits.
- **⌘W** closes the visible selected terminal tab, with confirmation for a running process. It is disabled when the terminal area is hidden or empty. **⌘Q** quits the app.
- Click **?** in the upper-right corner for every keyboard shortcut. The neighboring **Notifications** button controls the coworker popup.

KlipRun reads existing OpenCode and Codex session data without changing their stores. Its bundled engine runs on a random local loopback port and requires an app-generated token. App preferences and its own state live in `~/Library/Application Support/KlipRun Desktop`.

## Screenshots

All sessions, project paths, and usage numbers shown below are fictional examples. [See the screenshot fixture and more views](docs/screenshots/README.md).

### Board and terminal

![KlipRun desktop with a synthetic OpenCode session visible in the embedded terminal](docs/screenshots/desktop-terminal.png)

### Kanban and session details

![Kanban board and session details with fictional agents](docs/screenshots/kanban-details.png)

### Office

![Office view with fictional coworkers](docs/screenshots/office.png)

### Statistics

![Statistics view with fictional usage data](docs/screenshots/statistics.png)

## Build from source

You need macOS, a **Swift 6 toolchain** (Xcode or Command Line Tools), and [Bun](https://bun.sh/) 1.4 or newer. The script detects your installed macOS SDK and Bun executable.

```sh
git clone https://github.com/klipbn/kliprun_desktop.git
cd kliprun_desktop
zsh scripts/build.sh
open dist/KlipRun.app
```

After building, run the checks:

```sh
zsh scripts/test.sh
cd engine && bun run test
```

The app uses SwiftUI, AppKit, WebKit, a local Bun engine, and a vendored copy of SwiftTerm. The application is MIT licensed; see [LICENSE](LICENSE) and [SwiftTerm's license](vendor/SwiftTerm/LICENSE). The engine and web UI are based on the original [KlipRun](https://github.com/klipbn/kliprun) project.

See [CHANGELOG.md](CHANGELOG.md) for release history.
