# KlipRun Desktop agent guide

## Product contract

KlipRun is a macOS app for observing OpenCode and Codex sessions and starting new agents in embedded terminal tabs. Preserve the existing dark Kanban, Office, Statistics, and details design. Keep fixed UI copy in English; display user-provided session titles and project names as received.

The bundled engine reads the agents' existing stores. Its API must stay on loopback and require the app-generated token. A selected card may switch an already visible terminal to its matching agent; selecting a card must not open a hidden terminal dock. Match terminal tabs to sessions using process evidence, and keep ambiguous Codex matches unresolved. Workflow Claude and Codex cards are the one case where the app opens a terminal tab by itself (engine `launches` → `DesktopStore.openWorkflowTerminal`); their completion comes from the CLI's own turn-complete hook, never from terminal silence.

## Where to work

| Area | Source of truth |
| --- | --- |
| App lifecycle, menus, keyboard shortcuts | `app/Sources/KlipRunDesktop/KlipRunApp.swift` |
| Window, terminal dock, resizing | `app/Sources/KlipRunDesktop/ContentView.swift` and `DesktopStore.swift` |
| Agent processes and terminal colors | `app/Sources/KlipRunDesktop/TerminalSession.swift`, `app/Sources/KlipRunCore/AgentLaunch.swift` |
| Native ↔ web selection and actions | `app/Sources/KlipRunDesktop/KlipRunWebView.swift`, `engine/src/client/src/nativeBridge.ts` |
| Notifications | `app/Sources/KlipRunDesktop/PopupNotifications.swift`, `OriginalNotificationView.swift` |
| Read-only session engine and API | `engine/src/server/`; shared payload types in `engine/src/shared/` |
| Kanban, Office, Statistics, help | `engine/src/client/src/`; Office art in `office/appearance.tsx` and `office.css` |
| Terminal dependency | `vendor/SwiftTerm/` is vendored upstream code; keep its license and avoid unrelated formatting |

The engine and web UI began as a snapshot of [KlipRun](https://github.com/klipbn/kliprun). Check the current desktop copy before changing it; edits to `../kliprun_bun` do not update this app.

## Work sequence

1. Inspect the affected Swift, TypeScript, tests, and `git status` before editing. Trace behavior across the native bridge when a feature crosses SwiftUI and React.
2. Keep changes focused. Add a regression test for nontrivial behavior; test visual changes in both normal and small layouts. Run agent processes only in disposable projects, and close only the test processes you started.
3. On a clean checkout, run `zsh scripts/build.sh` once; it installs both Bun dependency sets. Run `zsh scripts/test.sh` for Swift changes and `cd engine && bun run test` for engine or web changes. Check `git diff --check`, inspect the final diff, and verify a packaged app with `codesign --verify --deep --strict dist/KlipRun.app` when packaging changes.
4. Update `README.md` for user-facing setup or behavior and `CHANGELOG.md` for release-facing changes. Keep the version in `app/Info.plist`, `engine/package.json`, and `engine/src/client/package.json` aligned.

The build script installs missing Bun dependencies, compiles a host-architecture app into `dist/KlipRun.app`, and signs it locally. `dist/`, `.build/`, `node_modules/`, and Playwright artifacts are ignored by Git. The GitHub 0.0.1 asset is Apple Silicon only and is not notarized.

## Screenshots and data

The committed screenshots in `docs/screenshots/` must use only `docs/screenshots/mock-api.json`. That fixture contains fictional titles, session IDs, project paths, and usage metrics. Capture from the web client with mocked `/api/*` responses; never point screenshot tooling at a live user's session API or include personal terminals, notifications, paths, or tokens. See `docs/screenshots/README.md` for the images and their provenance.

## External actions

Local edits, builds, and tests are allowed. Commits, pushes, PRs, merges, and releases require authorization in the current chat. An explicit release request such as “делай релиз 0.0.21” requests and authorizes the full release workflow for that version: branch, commits, push, PR, merge, tag, and GitHub release. Continue through those steps without asking again; unrelated external actions still require approval. Do not terminate an existing user agent to test or replace an app bundle.

## Releases

For a release request, follow [docs/RELEASING.md](docs/RELEASING.md) through publication and download verification. “Release VERSION” means that complete workflow, not just a version bump or local build. Report the release URL, merged PR, and checks when finished.
