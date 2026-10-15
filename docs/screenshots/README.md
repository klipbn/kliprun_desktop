# Demo screenshots

These images show the real KlipRun web interface with **fictional data** from [`mock-api.json`](mock-api.json). Every session ID, task title, project path, model total, and usage metric in the fixture is an example. The screenshots were refreshed from version 0.0.4 on 2026-10-15, with the clock fixed to the fixture date (2026-10-14) and `/api/*` requests served locally from the fixture; they were not taken from a user's live agent stores or terminal. `desktop-terminal.png` combines the fixture-based board capture with a synthetic terminal panel and transcript from [`terminal-demo.html`](terminal-demo.html); it does not run an agent process.

| File | Example shown |
| --- | --- |
| [`recent-sessions.png`](recent-sessions.png) | Recent Sessions sidebar, historical sessions, Resume in Terminal controls, and selected session details |
| [`desktop-terminal.png`](desktop-terminal.png) | Full desktop window with a synthetic OpenCode terminal |
| [`kanban.png`](kanban.png) | Kanban columns and nested subagent |
| [`kanban-details.png`](kanban-details.png) | Selected card and session activity |
| [`office.png`](office.png) | Work, idle, and meeting areas with synthetic coworkers |
| [`statistics.png`](statistics.png) | Thirty days of synthetic usage, Daily token heatmap and token mix, timezone UTC |
| [`statistics-weekly.png`](statistics-weekly.png) | Weekly token heatmap and token composition for the same period |
| [`usage.png`](usage.png) | Synthetic subscription allowances for OpenAI via OpenCode and Codex, Z.ai, and Kimi |
| [`shortcuts.png`](shortcuts.png) | In-app keyboard shortcut guide |

The mock API payload covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, `/api/stats/office-usage`, and `/api/quota/:provider` (the `quotas` map). When updating screenshots, serve the built `engine/src/client/dist` without a live engine, intercept those routes with the fixture, and verify that names and paths still refer only to the demo data before committing the images. The desktop terminal composition uses only the existing fixture screenshot and the static synthetic content in `terminal-demo.html`.

`recent-sessions.png` captures the 0.0.4 web UI at 1600 × 1000 with the clock set to the fixture's `board.generated_at`. The `recent_sessions` fixture includes five board sessions and two historical sessions absent from the board. A stub desktop bridge displays the native action buttons without launching agents. The selected session is `ses_demo_search`, matching the fixture's `details` payload.

`usage.png` captures the 0.0.4 Usage tab at 1600 × 1500 with the clock fixed to `board.generated_at` and a stub desktop bridge. All four `/api/quota/:provider` responses come from the fixture's `quotas` map; the example includes healthy, low, and exhausted balances. Provider names match the actual supported integrations. No provider credentials, live quota APIs, or real user data were used. [`capture-usage.js`](capture-usage.js) is a Playwright callback for this view.

Build the client with `cd engine/src/client && bun run build`, then run `bun docs/screenshots/preview.ts` from the repository root. This fixture-only server binds to `127.0.0.1:18796`, serves the built UI, stubs the desktop bridge and clock, and computes Statistics using the production aggregators. The synthetic terminal composition is available at `/__demo/terminal-demo.html`. No live engine is needed.

The 0.0.4 Statistics screenshots use `statistics_dataset`, a fictional 60-day event and observation history in `mock-api.json`, aggregated by the production `buildDashboard` and `rankSessions` functions. The stored `stats` and `stats_sessions` payloads are its last-30-days UTC view. Interactive checks apply real filters to this fixture dataset; dates, token components, call counts, and heatmap totals are derived from the same records. The clock stays fixed to `board.generated_at`.
