# Session workspace implementation plan

**Goal:** Implement the approved compact Sessions prototype, including project groups, favorites, metrics and Control+1–6 navigation.
**Design:** `docs/prototypes/projects/index.html` and its README. All sessions is the initial workspace view. No session tags.
**Architecture:** React owns organization state; a validated native preferences bridge persists it across engine ports and application restarts. A read-only worker endpoint returns the complete root-session catalog with observed runtime and top-model timing. Current context comes from board snapshots. Agent stores are never modified by organization actions.
**Stack:** Existing SwiftUI/WebKit, React/TypeScript, Bun/SQLite; no added dependencies.

Execution is local and sequential. No commits, pushes or release are authorized. `update_plan` is unavailable in this session; this checklist tracks progress.

## 1. Catalog and organization model — completed

- [x] Add failing tests for overlapping observed intervals, unknown metrics, and model ranking; implement `buildSessionCatalog` and `/api/session-catalog` in the existing statistics worker. Read metadata and intervals without importing message bodies into the response.
- [x] Add tests for project/group creation, moving and unassigning sessions, favorites, validation, ordering and persistence. Implement `sessions/model.ts` with explicit assignments (unassigned sessions stay in No project), stable IDs and project-scoped groups.
- [x] Run focused Bun tests and check engine types.

## 2. Native storage and navigation — completed

- [x] Test and implement `SessionWorkspace` validation and UserDefaults persistence in KlipRunCore; wire its main-frame/loopback-validated WebKit bridge and refreshed injection script.
- [x] Add Sessions `/sessions`; update menus, accepted routes, startup preference options, web toolbar and shortcut help to Sessions, Kanban, Office, Git, Usage, Statistics on Control+1–6. Keep `/` as the existing Kanban route and preserve saved startup choices.
- [x] Verify Swift tests, including persistence/rejection and startup navigation.

## 3. Compact Sessions interface — completed

- [x] Implement `sessions/Sessions.tsx` and scoped CSS with All sessions, Favorites and project navigation; groups and Uncategorized within a project; collapsible lists, search, agent filter and client pagination over the complete catalog.
- [x] Implement native dialog forms for project/group creation and moving selected sessions, drag/drop, undo and favorites. Preserve original directories and protect against invalid group destinations.
- [x] Show observed running duration, latest context usage and model with the most observed running time; show unknown values as dashes. Reuse the existing details panel and native resume/selection paths.
- [x] Remove Recent Sessions from Kanban. Keep terminal selection behavior and Git directory tracking intact.

## 4. Integration validation and documentation — completed

- [x] Use only mock-api.json for browser coverage. Check grouping, assignments, unknown values, persistence, empty/error states, keyboard navigation and normal/small layouts, including more than one page of sessions.
- [x] Update README and Unreleased changelog; update screenshot fixture preview and affected screenshot documentation/scripts for the navigation change.
- [x] Run `cd engine && bun run test`, engine typecheck, client build, `zsh scripts/test.sh`, local package build and `codesign --verify --deep --strict dist/session-workspace/KlipRun.app`. Inspect final diff and `git diff --check`.
- [x] Report implementation and checks; do not restart existing user sessions or publish a release.

## Verification results

- Bun: 245 server/shared tests and 125 client tests passed.
- Swift: 82 tests passed, including native workspace validation/persistence and the updated startup-screen controls.
- Engine typecheck and client production build passed.
- Workspace browser coverage passed at 1440, 980, 700 and 600 pixels, including Control+1–6 and a 212-session catalog. Git repository picker, session following and bounded discovery checks passed.
- Fixture-only captures refreshed ten screenshots with zero external requests.
- Separate app bundle built at `dist/session-workspace/KlipRun.app`; strict deep code-signature verification passed. The first sandboxed packaging attempt failed in iconutil; the approved unrestricted build completed.
- Final diff reviewed; `git diff --check` passed. No commit, push, restart or release performed.

## Follow-up: Office before Git — completed

- [x] Change toolbar, web shortcuts, native menu, startup options and shortcut help to Sessions → Kanban → Office → Git → Usage → Statistics.
- [x] Update navigation checks and current documentation/screenshots.
- [x] Verify browser navigation and Swift settings; rebuild the isolated app and verify its signature.

Follow-up verified: browser Control+1–6 navigation, 82 Swift tests, client build, isolated app packaging and strict deep signature verification passed. Ten fixture screenshots refreshed.
