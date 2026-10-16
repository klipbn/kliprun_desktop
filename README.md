# KlipRun Desktop

KlipRun is a macOS app for following OpenCode and Codex sessions in one place. It shows a Kanban board, an animated Office view, usage statistics, notifications, and live terminal tabs for agents you start inside the app.

## Install

The downloadable build is for **Apple Silicon Macs running macOS 13 or newer**.

1. Download `KlipRun-0.0.10-macos-arm64.zip` from the [latest release](https://github.com/klipbn/kliprun_desktop/releases/latest).
2. Unzip it and move `KlipRun.app` to **Applications**.
3. Open the app. The release is signed locally but is not notarized, so macOS may block the first launch. If it does, go to **System Settings → Privacy & Security → Open Anyway**, then open KlipRun again.

Install and sign in to [OpenCode](https://opencode.ai/) or [Codex CLI](https://github.com/openai/codex) separately. KlipRun does not include either CLI or its credentials.

### Update

KlipRun checks for updates in the background at launch and once an hour while it is running. When a newer compatible stable GitHub release is available, the button beside Settings turns amber with a dot and shows **Update available** in wider windows. Hover over it to see the version. Background checks do not open a window; a failed check keeps the last known update indicator.

Click **Updates** beside Settings (a download icon in narrower windows), or choose **KlipRun → Check for Updates…**, to check manually and open the update window. **Download Update** saves its ZIP in a separate folder in **Downloads** after verifying the release's SHA256 checksum. You can keep working during the download and reopen Updates to see its result.

Choose **Quit and Show Update** when ready. If terminals are active, the usual exit confirmation appears; cancelling keeps KlipRun running and the download ready. Finder reveals the ZIP only after KlipRun exits. Unzip it, move the new `KlipRun.app` into **Applications**, confirm replacement, and launch it again. **Keep KlipRun closed while replacing the app.** Updating does not change your saved preferences or session stores. If macOS blocks the new build, use **System Settings → Privacy & Security → Open Anyway** as for the first installation.

## Screenshots

All sessions, project paths, and usage numbers shown below are fictional examples. [See the screenshot fixture and more views](docs/screenshots/README.md).

### Recent sessions

Browse recent OpenCode and Codex sessions, inspect their details, and resume them in the original agent and project folder.

![Recent Sessions sidebar with session history, Resume in Terminal buttons, and selected session details](docs/screenshots/recent-sessions.png)

### Board and terminal

![KlipRun desktop with a synthetic OpenCode session visible in the embedded terminal](docs/screenshots/desktop-terminal.png)

### Kanban and session details

![Kanban board and session details with fictional agents](docs/screenshots/kanban-details.png)

### Office

![Office view with fictional coworkers](docs/screenshots/office.png)

### Statistics

![Statistics view with fictional usage data](docs/screenshots/statistics.png)

### Subscription limits

![Compact Usage rows with fictional provider balances, colored status dots, and white reset labels](docs/screenshots/usage.png)

## Use

- **Kanban** shows active sessions and those needing attention. Click a card to inspect its activity. **Agents T** shows the time of each reply: relative age below 12 hours, then exact local date and time. Hover over a relative age to see the exact time.
- **Running** uses arrival order until you reorder cards manually; new arrivals appear after the saved cards.
- Set **Critical**, **Medium**, or **Low** priority by clicking the small flag beside a Kanban card’s title. Priorities are saved in macOS preferences for each session and restored across app launches.
- Drag any part of a top-level Kanban card to move it up or down within **IDLE**, **RUNNING**, or **NEEDS ATTENTION**. Focus the card and press **↑/↓** to reorder with the keyboard. Each column remembers its order across app launches; child sessions stay with their parent.
- **Recent Sessions** on the left lists the latest 50 top-level sessions. Click a title for details or **Resume in Terminal** to continue the same Codex or OpenCode session in its original folder. An existing matching tab is selected when available. The panel remembers whether it is collapsed.
- **Kanban** next to **Statistics** returns to the board from any view. **Office** shows the same agents as animated coworkers; the coworker matching the selected terminal has a blue outline and a **Terminal** badge, just like the board card.
- **Statistics** opens on the last 30 days. Daily and Weekly token heatmaps, token composition, peak-day and leading-model/project highlights, trends, work patterns, and task rankings share the same date and source filters. Choose a token type, click a day or week to explore it, and use **Back to previous range** to return. The task list includes calls and tokens per call. **Last 90 days** reveals longer-term patterns; **Export daily CSV** saves exact totals through the macOS save dialog.
- **Usage** next to Office (**Control+4**) shows remaining subscription allowances for OpenAI via OpenCode, OpenAI via Codex, Z.ai, and Kimi. Compact provider rows keep their size when the terminal opens; scroll Usage when less vertical room is available. Expand **Reset schedule and provider information** for upcoming resets. Rows show each available limit window, the lowest remaining allowance, and reset times. The status dot uses the lowest remaining window: green above 30%, yellow above 10% through 30%, red at 10% or below, and gray for stale or unavailable data. Limits refresh every minute while the app is open, or with **Refresh**.
- The **bottom status bar** shows compact remaining-limit bars and percentages for up to six connected providers. Available 5-hour and weekly windows appear separately; other periods keep their own labels. Hover for reset times or click a provider to open Usage. Cached balances and pending resets are marked in gray. The limits wrap onto another row in narrow windows.
- **New OpenCode** and **New Codex** ask you to choose a project folder, then start the agent in the terminal panel.
- **⌘T** lets you choose OpenCode, Codex, or a plain terminal. A plain terminal opens in the selected tab's folder, or your home folder when no tab is selected.
- Drag terminal tabs left or right to reorder them. **⌘1–9** follows the new order. Hover over a tab to see the full folder path it was launched from.
- Clicking a session card switches an already visible terminal when its session is known. Codex clients using a shared daemon may not expose an exact process link. For an existing unlinked tab, select its card, then right-click the tab and choose **Link to Selected Session**. The explicit link lasts for that tab; a conflicting exact process link takes precedence. **Resume in Terminal** preserves the requested session link even when process descriptors are unavailable.
- Click **Terminal** to show or hide the terminal area. Tabs keep running while hidden. Closing an active tab or quitting the app asks before ending its process.
- Use the position button beside **+** in the terminal toolbar to switch between **Move terminal to left** and **Move terminal to bottom**. Drag the divider to adjust the pane; its position, bottom height, and left width are remembered independently. Moving the panel keeps the current terminal and dashboard view open.
- Exiting an agent or shell automatically closes its terminal tab. The terminal area hides after the last tab exits.
- **⌘W** closes the visible selected terminal tab, with confirmation for a running process. It is disabled when the terminal area is hidden or empty. **⌘Q** quits the app.
- Click **?** in the upper-right corner for every keyboard shortcut. Open **Settings** with the neighboring button or **⌘,**. Settings are saved between launches.
- **Settings → Terminal** adjusts mouse-wheel speed from **1–10×** (default **5×**), smooth scrolling for trackpads and Magic Mouse independently (default **1×**), terminal font size (**10–24 pt**), and left/bottom placement. Speed and font changes apply to all open terminals immediately and to newly opened tabs. Wheel speed also applies when Codex/OpenCode handles scrolling itself; generated input remains rate-limited.
- **Settings → Appearance** controls interface scale independently of the terminal font, the next launch's startup screen, the default details tab, and reduced Office animations. The macOS Reduce Motion setting is also respected.
- Session details default to **Agents T**, the first tab before **All**. It shows only agent text, with Markdown headings, lists, links, tables, and code blocks; tool calls and technical metadata remain in the other tabs. You can choose **All** or **Agent** as the default in Settings.
- **Settings → Notifications** controls the coworker popup, with separate **Response ready** and **Needs your input** switches. **Sound** offers installed macOS system sounds, **Preview sound**, and **None** for silence. The selected sound plays when a popup appears, including **Show preview**. Display duration and popup position controls are in the same section.

KlipRun reads existing OpenCode and Codex session data without changing their stores. Its bundled engine runs on a random local loopback port and requires an app-generated token. App preferences and its own state live in `~/Library/Application Support/KlipRun Desktop`.

If a Codex process scan temporarily fails, the board keeps the last observed sessions until a successful scan updates which terminals are running.

Codex shows one card per live terminal. When the shared daemon keeps multiple chats loaded and the current chat cannot be identified, the card displays **Session not linked**. Use **Current chat** to choose the chat open in that terminal; its title, status and details then appear on the card. You can change or clear the choice. It lasts while that terminal process runs; conflicting exact process evidence takes precedence. Unlinked terminal cards do not contribute session history, usage statistics or unread counts.

Usage reads OpenCode's `auth.json` beside its database (normally `~/.local/share/opencode/auth.json`, honoring `XDG_DATA_HOME`) and Codex's `auth.json` in `CODEX_HOME` (normally `~/.codex`). The local engine makes read-only requests directly to the providers' quota APIs; credentials stay in the engine and are never sent to the web interface. OpenAI subscription limits require a ChatGPT sign-in; API-key-only accounts cannot provide them. For an expired sign-in, open the corresponding agent to renew it, then refresh Usage. Last successful balances stay in memory while the app runs; on a provider failure they are marked **Cached**. Missing or unsupported limits stay unknown. OpenCode and Codex may use different OpenAI accounts; cards are separate sources, not additive allowances. Statistics remains the place for historical token consumption.

Statistics heatmaps use the selected time zone and Monday-based calendar weeks. Colors are relative to the busiest day or week for the selected token type. Current days and clipped weeks are marked as partial; empty cells mean no recorded usage. Calls without a known date remain in all-time totals and are excluded from calendar cells. Input, cache read/write, output, and reasoning are counted without overlap. The input cache ratio uses all input tokens as its denominator; it is not an estimate of money saved. CSV exports include date boundaries, timezone, every token component, call counts, and partial/incomplete flags. Heatmap mode and token type are preserved in the Statistics URL.

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
