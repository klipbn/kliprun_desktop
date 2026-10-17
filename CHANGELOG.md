# Changelog

Notable changes to KlipRun Desktop are recorded here. Versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.17] - 2026-10-17

### Added

- Select a theme in Settings → Appearance, with the original Default palette and five Zed-inspired dark and light palettes under KlipRun names. Apply each palette to the interface and open terminal tabs immediately.

### Fixed

- Replace the macOS Help command that opened a missing Help Book with links to the KlipRun guide and issue tracker.
- Show the theme list as a compact menu in Settings and keep OpenCode and Codex icons visible in light themes.

## [0.0.16] - 2026-10-17

### Added

- Install verified updates inside KlipRun with **Install and Restart**, automatic app replacement, a rollback copy, and a one-time **What's New** panel after restart. Verify the bundle identity, version, signature, and architecture before offering installation.
- **Latest sessions** above Token activity and Token mix: choose 5, 10, 20, or 50 recent tasks, remember the count, and inspect token categories, agents/models, last activity, observed time, calls, turns, subagents, and recorded costs under the current filters.

### Changed

- Use the Recent Sessions dropdown style for the Git repository picker, with searchable names and paths, keyboard navigation, and a popup bounded by the window.
- Label cache-read tokens **Cached input** throughout Statistics, with explanations distinguishing them from uncached input and cache writes.

## [0.0.15] - 2026-10-17

### Changed

- Compact Recent Sessions with search across indexed history, Agent/Project/Updated filters, pagination, and inline resume controls. Preserve search and filters while switching views or collapsing the panel.
- Resize Recent Sessions from its right edge or with Left/Right keys; remember the width across launches. Keep filter menus inside the panel and search projects by name or folder path.
- Add Git Changes settings for List/Tree, Path/Name, and grouping by tracked or staging status. Remember choices and keep both diffs for partially staged files.
- Group toolbar utilities as **Check for Updates → Keyboard shortcuts → Settings**.
- Expand available-update notes to the main window's full height, with scrolling and fixed action buttons.

### Fixed

- Open Git reliably with large project histories by splitting repository discovery into bounded requests. Handle invalid API responses without WebKit's “The string did not match the expected pattern.” error.
- Follow the selected session's repository, including older Recent Sessions entries, and open a changed file's diff automatically. Clear stale changes for sessions without Git; label the repository context and manual **Choose Folder…** action.
- Commit immediately with **Commit staged**, without another confirmation. Keep the message field at a fixed height with scrolling, retain drafts per repository, and preserve messages on failure.

### Documentation

- Shorten the README to an app overview, screenshots, installation, and build commands. Refresh all thirteen demo screenshots using fictional fixture data only.

## [0.0.14] - 2026-10-17

### Added

- **Git** workspace immediately after Kanban, with repositories from active/recent sessions, a native **Open Repository** folder picker, and a remembered repository selection.
- **Changes** with separate Staged, Unstaged, and Untracked folder trees, whole-file stage/unstage and group actions, line-numbered diffs, and commits of the staged index. Failed commits preserve the message. Support worktrees, initial commits, detached HEAD, renames, deletions, binary files, and bounded previews.
- Paginated **History** with authors, dates, hashes, branch/tag labels, commit files, and diffs. Merge commits compare with their first parent.
- One searchable branch popover with local/remote groups, author, commit age, and last message. Select to switch immediately, or type a new name and press Enter to create at HEAD; arrow keys, Escape, and outside-click dismissal are supported.
- **Fetch**, fast-forward-only **Pull**, and **Push / Publish** through system Git and existing authentication. Use the configured remote automatically. Run directly without confirmation windows or success notifications; refresh silently and keep errors visible.
- Resizable right-hand Git panel: drag its divider or use Left/Right keys, remember the width across views, and stack panels in small windows.
- All five session details tabs as saved defaults in **Settings → Appearance → Default views**: **User**, **Agents T**, **Agent**, **Models**, and **Kanban**. Apply changes to open and newly selected details; Agents T remains the fallback.

### Changed

- Icon-only header controls with OpenCode/Codex logos, accessible names, and shortcut tooltips. Order primary controls as **Kanban → Git → Office → Usage → Statistics → Settings**; retain update/help utilities and the update-available indicator.
- Navigation shortcuts follow the tab order: **Control+1** Kanban, **Control+2** Git, **Control+3** Office, **Control+4** Usage, **Control+5** Statistics. Settings remains **Command+,**; Git is also a startup-screen choice.
- Terminal new-tab, position, expand/restore, hide, and session-tab close controls highlight on hover, with larger close hit areas and descriptive tooltips.
- Successful local Git actions show a compact toast for 2.5 seconds without a close button or shifting the workspace. Commits retain confirmation; branch/HEAD guards reject stale operations. Git subprocesses have output/time limits, literal file-path handling, and credential-redacted errors.

### Documentation

- Document Git workflows, shortcuts, toolbar controls, terminal feedback, default details tabs, and installation for 0.0.14. Refresh all twelve demo screenshots using fictional fixture data only, including Git Changes, branch selection, and History.
- Add Git integration and browser regressions for repository actions, branch selection, errors, diff rendering, resizing, keyboard controls, and small layouts; extend preference and toolbar checks.

## [0.0.13] - 2026-10-16

### Changed

- Open Settings as a dark panel over the right side of the main window, with custom tabs, buttons, switches, and app colors. Close with Escape, the close button, or the dimmed background. Preserve all existing preferences.
- Format **What's New** Markdown with headings, nested and numbered lists, emphasis, code, quotes, and clickable web links.

### Added

- **Settings → Updates** and **About**, with version and architecture, local engine status, active terminal count, app data/log shortcuts, credential-free diagnostics copying, and a short author profile linking to klipbn and the source code. Add a live terminal font preview, terminal defaults reset, scale presets, and a terminal shortcut reference.
- Live update download progress with downloaded/total bytes and percentage when available, followed by a separate SHA256 verification stage. Reopening Updates preserves the active download.
- Four-step installation guidance after downloading, **Show ZIP in Finder**, and an explicit reminder that downloading the archive does not install it. Keep **Quit and Show Update** and the existing active-session exit confirmation.

### Fixed

- Select terminal position, startup screen, default details tab, and interface scale presets by clicking anywhere inside their settings buttons, including the space around the text.

### Documentation

- Refresh all nine demo screenshots for 0.0.13 using fictional fixture data only.

## [0.0.12] - 2026-10-16

### Added

- Click the current Git branch in session details to open it on GitHub or GitLab. Links use the branch's tracking remote, or origin, and support SSH remotes and worktrees. A branch without a remote remains plain text.
- Recognizable Codex and OpenCode icons beside harness names on session cards and in details.

### Changed

- New embedded Codex tabs identify their current chat automatically, including after `/new` and `/resume`. Remove the manual chat selector; ambiguous or unavailable IDs remain unlinked instead of selecting a guessed session.
- Simplify session details: remove **iTerm2** and **All**, and order tabs as **User → Agents T → Agent → Models → Kanban**. **Agents T** remains the default; a saved **All** preference now falls back to it.
- Explain the Kanban tab with **Status history and time spent in each state.**

### Fixed

- Switching terminal tabs updates the right-hand session details as well as the card highlight. Tabs without a confirmed session keep the current details open.
- Read the current Git branch on each refresh, removing the previous ten-second delay after a checkout. Resolve relative worktree paths and keep detached HEAD from displaying a parent repository's branch.

### Compatibility

- On Codex 0.163, the per-launch terminal-title setting uses an embedded backend rather than automatically reusing the shared daemon. Existing daemon sessions keep running, and configuration and chat history stay shared. Existing or external terminals without the title signal still require confirmed process evidence.

### Documentation

- Refresh all nine demo screenshots for 0.0.12 using fictional fixture data only.

## [0.0.11] - 2026-10-16

### Added

- Show the new release's GitHub description in **What's New** before **Download Update**, both after a manual check and when opening the background update indicator. Long notes scroll with the action buttons always visible. Releases with missing or blank descriptions show a placeholder.

## [0.0.10] - 2026-10-16

### Added

- Check for updates silently at launch and once an hour. Highlight the Updates button with an amber dot and **Update available** when a newer compatible stable release is found; show its version on hover. Preserve the last known indicator during network failures and the ready download while checking in the background.

### Documentation

- Refresh all nine demo screenshots for 0.0.10 using only fictional fixture data.

## [0.0.9] - 2026-10-16

### Added

- **Updates** beside Settings and **KlipRun → Check for Updates…** check the latest stable GitHub release, download a ZIP matching the app's architecture, and verify its SHA256 checksum. **Quit and Show Update** reveals the verified ZIP in Finder only after KlipRun exits; unzip it and replace the app in Applications while KlipRun is closed. Cancelling the active-terminal exit confirmation keeps the download ready.

### Changed

- Wrap toolbar controls in narrow layouts and use a compact update icon when space is limited.

### Documentation

- Refresh all nine demo screenshots for 0.0.9 using only fictional fixture data.

## [0.0.8] - 2026-10-16

### Added

- **Current chat** selector on unresolved Codex terminal cards: explicitly choose or clear the chat open in a terminal. Choices last while that process runs; conflicting exact process evidence takes precedence.

### Fixed

- Preserve Codex cards and their status history when a process scan temporarily fails; remove them after a successful scan confirms the terminals exited.
- Show one card per live Codex terminal, keeping previous daemon-loaded chats off the board. Exclude unlinked cards from session statistics and unread counts.
- Keep terminal cards visible with an unknown status while session metadata is unavailable.

### Documentation

- Refresh all nine demo screenshots for 0.0.8 using only fictional fixture data.

## [0.0.7] - 2026-10-16

### Added

- Timestamp each **Agents T** reply: relative age for the first 12 hours, then exact local date and time; hover over any age to see its exact time.
- Show the terminal’s full launch folder path when hovering over its tab.
- Drag terminal tabs by their title or background to reorder them; keep the close button separate and numbered keyboard shortcuts in the new order.
- Reorder top-level Kanban cards within each status column by dragging anywhere on the card, with a full-card drag preview, or using Up/Down keys. Save each column's order across app launches.
- **Link to Selected Session** in the terminal tab context menu for Codex daemon clients that do not expose an exact process-to-session link.

### Fixed

- Keep MR badges and metadata icons within narrow session cards: wrap rows, truncate long MR labels, and avoid double indentation of child cards.
- Preserve explicit resumed or user-linked session identities when terminal process descriptors are unavailable. Prefer conflicting exact process evidence and leave multiple observed sessions unresolved.

### Documentation

- Refresh all nine demo screenshots for 0.0.7 using only fictional fixture data.

## [0.0.6] - 2026-10-15

### Added

- Per-session **Critical**, **Medium**, and **Low** priorities, selected through a small flag beside the Kanban title. Priorities are saved in macOS preferences and restored across app launches.

### Changed

- Compact Usage provider rows with larger names, remaining-quota status dots, and white limit/reset labels. Remove the KPI overview and plan/status subtitles; expand reset schedules and provider information on demand.
- Keep Usage row sizes stable when opening the terminal dock; scroll the page when vertical room is limited.
- Use pure white text for terminal tabs, session and model names, toolbar buttons, and the session-details close control. Center **New OpenCode**, **New Codex**, and **Terminal** relative to the window, with a separate centered row in narrower layouts.
- Enlarge the coworker notification close icon to **16 pt** and its click target to **36 × 36 pt**.

### Fixed

- Restore the Codex context bar for long journals when the model event is outside the bounded tail, using the same session’s persisted model without attributing historical spend to it.

### Documentation

- Refresh all nine screenshots from the 0.0.6 UI using fictional fixture data, including sample priority flags and the current Usage layout. Add a reusable capture callback and update screenshot provenance.

## [0.0.5] - 2026-10-15

### Added

- Default **Agents T** session-details tab before **All**, showing only assistant text with Markdown formatting, including tables and code blocks. Details tabs wrap in narrow panels.
- System sound selection and preview in Notifications, with a saved **None** option for silence.
- Unified Settings window, available from the toolbar and **⌘,**, with Terminal, Appearance, and Notifications sections. Saves independent wheel/smooth scrolling speeds, terminal font size, interface scale, terminal placement, startup screen, default details tab, reduced Office animations, and notification event switches.

### Changed

- Default mouse-wheel scrolling to **5×**, with a configurable **1–10×** range and independent **1×** smooth scrolling. Apply changes immediately to open terminals.
- Keep interface zoom independent of terminal font size.

### Fixed

- Honor wheel speed when the terminal application requests mouse reporting, instead of reducing every wheel event to a single report. Retain bounded bursts and input rate limits.

### Documentation

- Refresh all nine demo screenshots for 0.0.4, show supported Usage providers, and include a fixture-only preview server.

## [0.0.4] - 2026-10-15

### Added

- Compact subscription-limit bars and remaining percentages in the bottom status bar, with separate available windows, reset details on hover, and a shortcut to Usage. Shows up to six connected providers and wraps in narrow windows.
- Shared quota loading for the status bar and Usage page, refreshing every minute across views without duplicate requests.

## [0.0.3] - 2026-10-15

### Added

- Terminal toolbar button to dock the panel on the left or bottom, with a draggable divider and independently remembered width and height. Moving the panel preserves the terminal and web view.
- Expanded Statistics with Daily/Weekly token heatmaps, token-type switching, token composition and cache ratio, peak-day and leading-model/project highlights, drill-down with return to the previous range, section navigation, and a 90-day period.
- Daily statistics CSV export through a native macOS save dialog, including exact token components and data-quality flags. Statistics now opens on 30 days and ranks tasks by tokens, with model calls and tokens per call shown in the table.
- Kanban navigation button next to Statistics and active-terminal highlighting for Office coworkers.
- Usage tab next to Office with Control+4, remaining subscription limits for OpenAI via OpenCode and Codex, Z.ai, and Kimi, provider availability, low-balance indicators, and upcoming resets.
- Read-only provider quota requests using existing local agent sign-ins, independent loading, automatic refresh, and explicitly marked cached balances when a provider is unavailable.

### Fixed

- Keep the terminal panel's new-tab menu in the right-hand control group instead of stretching its plus button into the middle.
- Start divider drags from the visible panel edge after the window is narrowed.

### Documentation

- Document subscription limits, expanded statistics, and left/bottom terminal docking.
- Add Daily/Weekly Statistics and Usage screenshots generated from fictional data.
- Show the Recent Sessions sidebar and session continuation controls in the README with a screenshot generated from fictional data.

## [0.0.2] - 2026-10-15

### Added

- Collapsible Recent Sessions sidebar with session details and continuation in the original Codex or OpenCode terminal and project folder.
- ⌘W closes the selected visible terminal tab using the existing end-session confirmation.

### Fixed

- Close terminal tabs automatically when their agent or shell exits; hide the terminal area when the last tab exits.
- Keep Running cards in arrival order instead of reordering them with every event.
- Preserve the system-rendered Dock icon appearance after launch by using the bundle icon.
- Read historical Codex session details after its terminal has exited.
- Keep terminal launch controls and Kanban columns usable in narrow windows with session details open.

### Documentation

- Add an agent development guide and screenshots generated from fictional session and usage data.

## [0.0.1] - 2026-10-14

First public macOS release.

### Added

- Native SwiftUI app with the original KlipRun Kanban, Office, Statistics, and session details in a WebKit window.
- Embedded OpenCode, Codex, and plain zsh terminals with independent tabs, resizing, full-window mode, and a project-folder picker for new agents.
- Two-way selection between Kanban cards and matching terminal tabs, including notification clicks that open the relevant session.
- Coworker popups with notification settings, draggable position, preview, and pause controls.
- Keyboard shortcuts for navigation, terminal tabs, new agents, zoom, and terminal layout, plus an in-app shortcut guide.
- Bundled local Bun engine with token-protected loopback API and read-only access to existing agent session stores.

### Fixed

- Codex terminal association when its shared daemon owns the session files, provided the match is unambiguous.
- Terminal tab switching and dock resize behavior; improved contrast for dim terminal text.
- Office coworker's raised arm, using the notification sprite's shoulder pivot and waving pose.
- Finder icon refresh for rebuilt `.app` bundles.

### Release notes

- The downloadable app targets Apple Silicon and macOS 13 or newer.
- The app is locally signed but not Apple-notarized; first launch may require **Open Anyway** in macOS Privacy & Security settings.
- Quitting the app ends agents started in its terminal tabs after confirmation.

[0.0.1]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.1
[0.0.2]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.2
[0.0.3]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.3
[0.0.4]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.4
[0.0.5]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.5
[0.0.6]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.6
[0.0.7]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.7
[0.0.8]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.8
[0.0.9]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.9
[0.0.10]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.10
[0.0.11]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.11
[0.0.12]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.12
[0.0.13]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.13
[0.0.14]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.14
[0.0.15]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.15
[0.0.16]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.16
[0.0.17]: https://github.com/klipbn/kliprun_desktop/releases/tag/v0.0.17
[Unreleased]: https://github.com/klipbn/kliprun_desktop/compare/v0.0.17...main
