# Demo screenshots

These images show the real KlipRun web interface with **fictional data** from [`mock-api.json`](mock-api.json). Every session ID, task title, project path, model total, and usage metric in the fixture is an example. The screenshots were captured at a fixed date (2026-10-14) with `/api/*` requests intercepted locally; they were not taken from a user's live agent stores or terminal. `desktop-terminal.png` combines the fixture-based board capture with a synthetic terminal panel and transcript from [`terminal-demo.html`](terminal-demo.html); it does not run an agent process.

| File | Example shown |
| --- | --- |
| [`recent-sessions.png`](recent-sessions.png) | Recent Sessions sidebar, historical sessions, Resume in Terminal controls, and selected session details |
| [`desktop-terminal.png`](desktop-terminal.png) | Full desktop window with a synthetic OpenCode terminal |
| [`kanban.png`](kanban.png) | Kanban columns and nested subagent |
| [`kanban-details.png`](kanban-details.png) | Selected card and session activity |
| [`office.png`](office.png) | Work, idle, and meeting areas with synthetic coworkers |
| [`statistics.png`](statistics.png) | Seven days of synthetic usage, timezone UTC |
| [`shortcuts.png`](shortcuts.png) | In-app keyboard shortcut guide |

The mock API payload covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, and `/api/stats/office-usage`. When updating screenshots, serve the built `engine/src/client/dist` without a live engine, intercept those routes with the fixture, and verify that names and paths still refer only to the demo data before committing the images. The desktop terminal composition uses only the existing fixture screenshot and the static synthetic content in `terminal-demo.html`.

`recent-sessions.png` captures the 0.0.2 web UI at 1600 × 1000 with the clock set to the fixture's `board.generated_at`. The `recent_sessions` fixture includes five board sessions and two historical sessions absent from the board. A stub desktop bridge displays the native action buttons without launching agents. The selected session is `ses_demo_search`, matching the fixture's `details` payload.
