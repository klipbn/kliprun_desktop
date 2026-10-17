# Living Office implementation plan

**Goal:** ship the three approved office floor plans in KlipRun, with real coworkers, parent/helper relationships, walking, and durable selection of the floor plan.

**Design:** `docs/prototypes/office/index.html`, approved in this conversation. Keep the real board, native selection contract, idle grace, unknown status handling, unread state, and accumulated-usage leaderboard. No simulation controls, fabricated helpers, or automatic approval in the app.

**Architecture:** React owns live residents and controls. A pure layout module groups families and computes furniture, destinations, and walkable routes. An SVG scene renders the approved office artwork and animates only positions and poses. A small validated Office preferences bridge persists layout and visual settings in UserDefaults, with localStorage fallback for the browser.

**Constraints:** English UI; original session/project titles; no new dependencies; no live data in screenshots; no commits, pushes, app replacement, or publication without separate approval. All new animation respects OS and app reduced motion. The current terminal bridge remains authoritative for actual session matches.

## Execution state

- [x] **Durable Office preferences.** Add failing tests for valid layout/settings round trips, malformed storage/message rejection, and a fresh web origin. Implement `office/preferences.ts`, `KlipRunCore/OfficePreferences.swift`, and the origin-checked `officePreferences` handler in `KlipRunWebView.swift`. Run focused Bun and Swift checks.
- [x] **Live layout and routes.** Add tests for real parent/child grouping, mixed states, stable positions under board reordering, bounded and distinct destinations, many sessions, and routes avoiding desk footprints. Implement `office/layout.ts` using existing `updatePlacements` for factual state and idle grace. Route from current positions to live destinations; never invent sessions or task transitions.
- [x] **Interactive scene and controls.** Port the approved pixel furniture into `office/Scenery.tsx`; implement `office/Scene.tsx` and revise `Office.tsx`/`office.css`. Include all three layouts, accessible selection, team links, labels/motion controls, Fit/zoom, and optional leaderboard. Pass app reduced motion from `App.tsx`. Adapt obsolete room-DOM tests while preserving all status, unread, model, timer, and active-terminal assertions. Add browser checks against the fictional fixture for settings, live updates, walking, and terminal selection.
- [x] **Verify and document.** Run `cd engine && bun run test`, client TypeScript/Vite build, `zsh scripts/test.sh`, fixture-only browser checks at normal and constrained native-webview sizes, and inspect screenshots. Update README/CHANGELOG and refresh only the Office fixture screenshot. Build into `/private/tmp/KlipRun-office-preview.app`, verify its signature, inspect final diff and `git diff --check`. No installation or release.

## Verification interfaces

- Preferences: `loadOfficePreferences(storage?, host?)`, `saveOfficePreferences(value, storage?, host?)`; validated fields `layout: loft|pods|studio`, `labels`, `links`, `animate`.
- Layout: `buildOfficeLayout(residents, placements, layout, aspect)` returns the world rectangle, rooms, furniture, obstacles, and a destination per real session; `routeBetween(from, to, world)` returns an obstacle-free path.
- UI: `[data-session-id]` exposes factual `data-office-state`, placement `data-office-zone`, parent, unread, and active-terminal status. Scene position/action are separate from factual status. Three layout buttons/select options and native preference messages are observable browser interfaces.
- Browser tests serve the built web client at `127.0.0.1:18796`, with `/api/*` mocked from `docs/screenshots/mock-api.json`. Runtime board updates use in-memory responses and board-refresh events, never an actual agent store.

## Verification results

- 233 server/shared tests and 101 client tests passed; 80 Swift tests passed. AppKit and loopback tests were run outside the sandbox after sandbox restrictions blocked them.
- TypeScript/Vite build passed. Browser checks passed for 15 layout/viewport combinations, helper arrival and supervision, waiting/unknown/idle transitions, idle grace, removal, empty office, native settings messages, selection, terminal highlighting, leaderboard, camera, and both reduced-motion sources; no browser errors or external requests.
- Built `/private/tmp/KlipRun-office-preview.app`; `codesign --verify --deep --strict` passed. Packaged web assets match the current client build byte for byte. The installed/running app was not replaced.
- Refreshed only the fictional Office screenshot, reviewed normal and short layouts and final source diff, and passed `git diff --check`. No commit, push, or release was performed.
