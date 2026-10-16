# Git workspace implementation plan

> Execute sequentially in this session with executing-plans; local changes only.

**Goal:** Add the approved Git workspace and shift the navigation shortcuts.

**Architecture:** System Git runs asynchronously behind authenticated Bun routes.
Shared payloads feed a lazy React workspace; Swift provides folder selection and
native navigation. Tests use disposable repositories and local bare remotes.

**Tech stack:** Bun, Hono, TypeScript, React, CSS, SwiftUI, WebKit, system Git.

**Spec:** `docs/superpowers/specs/2026-10-16-git-workspace-design.md`

## Global constraints

- Fixed UI copy remains English; preserve the existing dark theme.
- Keep loopback/token authentication and the agent stores read-only.
- No new dependencies; retain version 0.0.13.
- No commits, pushes, PRs, releases, or live-agent termination.
- Screenshots use only `docs/screenshots/mock-api.json`.
- The session does not expose update_plan; this checklist tracks execution.

## 1. Git service and API — completed

Files: create `engine/src/shared/git.ts`, `engine/src/server/git.ts`, `engine/src/server/gitProcess.ts`,
`engine/src/server/routes/git.ts`, `engine/src/server/__tests__/git.test.ts`;
register routes in `engine/src/server/index.ts`.

- [x] Run the baseline app build in a separate output bundle.
- [x] Add route integration tests for status/diff/history and rejected input;
  run `cd engine && bun test src/server/__tests__/git.test.ts` and observe failure.
- [x] Implement typed Git reads and bounded async processes. Routes take a
  repository directory plus named, validated parameters; actions use POST JSON.
- [x] Add and run tests for stage/unstage, branch switching, commit, fetch,
  fast-forward pull and publish/push using temporary repos and local remotes.
- [x] Verify mutation origin checks, symlink/path escape, literal pathspecs,
  large files/output, unborn/detached HEAD, and worktrees; run focused tests and
  `cd engine && bun run typecheck`.

## 2. Git workspace — completed

Files: create `engine/src/client/src/git/{Git,DiffView,FileTree}.tsx`,
`engine/src/client/src/git/git.css`, client Git regression tests; modify
`engine/src/client/src/App.tsx` and `nativeBridge.ts`.

- [x] Write failing rendering/parser tests with literal diff fixtures, then run
  them through `bun test src/__tests__` in the client directory.
- [x] Build repository selection, Changes/History, line-numbered diffs, staged
  groups, branch selection/creation, commit form and remote controls.
- [x] Add operation confirmations, pending/error/empty states, focus refresh,
  bounded history paging, and protection against stale async responses.
- [x] Add `/git` navigation immediately after Kanban, preserving Statistics URL
  state. Check client tests and `bun run build`.

## 3. Native integration and shortcuts — completed

Files: `KlipRunApp.swift`, `DesktopStore.swift`, `KlipRunWebView.swift`,
`SettingsView.swift`, `AppPreferences.swift`, `ShortcutHelp.tsx`, native bridge
tests and `AppPreferencesTests.swift`.

- [x] Add a regression for persisting `/git` as startup screen, observe failure,
  then allow it and add the startup choice.
- [x] Implement the guarded native repository picker and encode the selected
  directory safely into a web event; add its bridge regression.
- [x] Shift menu shortcuts, help and titles to Kanban 1 / Git 2 / Statistics 3 /
  Office 4 / Usage 5. Verify Swift and client tests.

## 4. Fixtures, documentation and visual checks — completed

Files: `mock-api.json`, `preview.ts`, screenshot capture helper/README,
`README.md`, `CHANGELOG.md`.

- [x] Add fictional Git status/history/diff responses to the existing fixture.
- [x] Inspect Changes, History, branches and confirmation flows in Playwright
  at normal/small sizes and limited height; fix observed layout issues.
- [x] Capture Git and updated shortcuts from fixture-only preview.
- [x] Document repository selection, Git operations and shifted shortcuts.

## 5. Final verification — completed

- [x] Run `cd engine && bun run test` and `bun run typecheck`.
- [x] Run `zsh scripts/test.sh`.
- [x] Build a separate app bundle with `zsh scripts/build.sh` and verify that
  bundle with `codesign --verify --deep --strict`.
- [x] Run `git diff --check`, inspect all modified/untracked files, check the
  approved spec against observable behavior and record actual check results.
- [x] Report the local artifact and any remaining limitations. Keep release
  operations outside this task.

## Verified outcome

- Engine/shared: 228 tests passed. Client: 74 tests passed.
- Swift: 71 tests passed, including Git startup preferences and settings clicks.
- TypeScript typecheck and production client build passed.
- Playwright: normal, short and narrow layouts (1440×900, 1440×500, 760×650,
  500×700); stage/unstage, confirmation cancellation, failed/successful commits,
  draft retention across navigation, delayed diff responses, history and branch
  controls. Zero browser exceptions or external requests.
- `docs/screenshots/capture-git.js` captured Git Changes/History and shortcuts
  using only the existing fictional fixture.
- Separate bundle built at `/private/tmp/KlipRun-git-preview.app`; strict deep
  codesign verification passed. Packaged Git source files match the repository.
- Packaged engine smoke test passed: authentication, status, untracked diff,
  stage/unstage and `/git`, using only a disposable repository.
- Tracked and new-file whitespace checks, fixture JSON parsing and final source
  review passed. No implementation commits, pushes, PRs or releases were made.

Git synchronization tests used local bare remotes; live remote authentication
was not exercised. Partial-hunk staging and destructive/history-rewriting Git
operations remain outside the approved first implementation.

## Follow-up: brief success notifications (2026-10-17) — completed

- [x] Inspect Git operation feedback and add a failing browser regression.
- [x] Replace persistent success banners with a compact toast that disappears
  after 2.5 seconds; reset its timer for each success and clear it on navigation.
- [x] Verify success/error behavior, successive operations, and normal/small
  layouts; run client/engine checks, review the diff and rebuild the preview app.

Follow-up verification: 228 engine/shared and 74 client tests passed; production
client build passed. Browser regressions verified automatic dismissal, persistent
errors, consecutive-operation timers and unchanged layout. Inspected the toast
at 1440×900 and 500×700 using fixture data only. The separate bundle
`/private/tmp/KlipRun-git-toast-preview.app` built successfully and passed strict
deep codesign verification. Git whitespace checks passed. No Swift code changed;
Swift tests were not repeated for this follow-up.

## Follow-up: branch picker in the bottom row (2026-10-17) — completed

- [x] Inspect branch status, the current menu and its callers; add regression
  coverage for per-branch commit metadata and a single branch popover.
- [x] Move the branch into the action row, remove the separate remote selector,
  and implement a searchable list with direct switching and inline creation.
- [x] Verify mouse/keyboard selection, search, creation, outside/Escape dismissal,
  normal/small layouts and configured remote use. Run tests/typechecks, refresh
  fixture screenshots, review the diff and build a separate signed preview app.

Branch-picker verification: 229 engine/shared and 74 client tests passed. Server
and client TypeScript checks and the production build passed. Browser checks
covered direct switching, inline creation, filtering, commit metadata, keyboard
navigation, focus restoration and outside dismissal across four layouts; zero
browser exceptions or external requests. Fixture screenshots were refreshed,
including `git-branches.png`, and normal/small popovers were visually inspected.
`/private/tmp/KlipRun-git-branches-preview.app` built successfully and passed
strict deep codesign verification. Packaged Git metadata sources match the
repository. Swift code was unchanged and Swift tests were not repeated. No
implementation commits, pushes, PRs or releases were made.

## Follow-up: immediate Pull (2026-10-17) — completed

- [x] Inspect Pull, confirmations and notifications; add a browser regression.
- [x] Run Pull directly from the button, refresh silently after success, and
  retain error reporting and the existing fast-forward/expected-HEAD checks.
- [x] Verify the browser workflow, engine/client tests, build and signature;
  review the final diff and update the user-facing documentation.

Immediate-Pull verification: browser regression first reproduced the confirmation
window, then passed with one-click Pull, no success toast, and normal repository
refresh. The complete workflow passed at four viewport sizes with zero browser
exceptions or external requests. All 229 engine/shared and 74 client tests passed.
Production client build, whitespace checks and strict deep signature verification
passed for `/private/tmp/KlipRun-git-pull-preview.app`; its client assets match
the current build. No Swift changes or live remote operations were made.

## Follow-up: direct Fetch/Push and resizable Git panel (2026-10-17) — completed

- [x] Inspect Git actions and existing details resizing; add browser regressions.
- [x] Run Fetch/Push/Publish immediately and silently on success. Add a draggable
  and keyboard-accessible divider using the existing details sizing helper;
  remember width and preserve a usable diff and stacked small-window layout.
- [x] Verify actions and panel drag/limits/navigation, run relevant checks,
  inspect normal/small layouts and the final diff, and build a signed preview.

Repeated resize verification exposed a viewport-transition race: the CSS
variable held a temporarily clamped width while the saved preference remained
correct. CSS now clamps the requested width directly; keyboard and pointer
resizing start from the actual rendered width. The regression passed twice
after the fix, including cancellation and cursor cleanup.

Final verification for direct remote actions and panel resizing: 229
engine/shared and 74 client tests passed, plus the existing details-sizing test.
The full browser workflow passed with immediate silent Fetch/Push/Publish; the
resizing workflow passed twice across four layouts, including absolute drag
distance, keyboard input, limits, cancellation, saved width, viewport changes
and navigation. Normal/small views were inspected from fictional fixtures.
`/private/tmp/KlipRun-git-panel-preview.app` built successfully, passed strict
deep signature verification, and contains the current client assets. Final
source review and whitespace checks passed. Swift code was unchanged, so Swift
tests were not repeated. No real remote writes or implementation commits were
performed.
