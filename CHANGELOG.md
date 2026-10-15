# Changelog

Notable changes to KlipRun Desktop are recorded here. Versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
[Unreleased]: https://github.com/klipbn/kliprun_desktop/compare/v0.0.2...main
