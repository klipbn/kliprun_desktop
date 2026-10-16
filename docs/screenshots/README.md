# Demo screenshots

All nine images were refreshed from **KlipRun Desktop 0.0.13** on **2026-10-16**. Session IDs, titles, project paths, models, priority flags, quotas, and usage totals come only from [`mock-api.json`](mock-api.json). The preview fixes the clock to the fixture’s `board.generated_at` (2026-10-14), supplies a stub desktop bridge, and disables Office motion. No live engine, user session store, credentials, quota API, or agent process is used.

| File | Size | Example shown |
| --- | --- | --- |
| [`kanban.png`](kanban.png) | 1440 × 900 | Kanban columns, nested subagent, and synthetic Critical/Medium/Low flags |
| [`kanban-details.png`](kanban-details.png) | 1440 × 900 | Selected Implement search API session and the default Agents T details tab |
| [`recent-sessions.png`](recent-sessions.png) | 1600 × 1000 | Recent Sessions sidebar, Resume in Terminal buttons, and matching selected details |
| [`desktop-terminal.png`](desktop-terminal.png) | 1440 × 900 | Fixture-based board plus a static synthetic terminal panel |
| [`office.png`](office.png) | 1600 × 1200 | Fictional coworkers, model labels, rooms, and token leaderboard |
| [`statistics.png`](statistics.png) | 1600 × 1600 | Last 30 days, Daily token activity, composition, and trends in UTC |
| [`statistics-weekly.png`](statistics-weekly.png) | 1600 × 1600 | Weekly token activity for the same fictional dataset |
| [`usage.png`](usage.png) | 1600 × 900 | Compact provider rows with colored status dots and white limit/reset labels |
| [`shortcuts.png`](shortcuts.png) | 1600 × 1000 | Current in-app keyboard shortcut dialog |

The fixture API covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, `/api/stats/session/:id`, `/api/stats/office-usage`, and `/api/quota/:provider`. Statistics uses `statistics_dataset`, a fictional 60-day event and observation history, through the production aggregators. The `card_priorities` map supplies only fictional session IDs. The selected details session is `ses_demo_search`, matching the fixture’s `details` payload.

Build the client with `cd engine/src/client && bun run build`, then start `bun docs/screenshots/preview.ts` from the repository root. The fixture-only server binds to `127.0.0.1:18796` and serves the built client without starting a live engine.

[`capture-all.js`](capture-all.js) is an async Playwright callback taking `(page, outputDirectory = "docs/screenshots")`. It captures all nine images, checks the UI version and provider names, and rejects external requests. Invoke it with a directory on the Playwright host, or run from the repository root to use the default directory. The 0.0.13 capture made **zero external requests**. [`capture-usage.js`](capture-usage.js) remains available for capturing Usage alone.

`desktop-terminal.png` combines the current `kanban-details.png` capture with [`terminal-demo.html`](terminal-demo.html), available at `/__demo/terminal-demo.html`. The terminal transcript and tabs are static fictional content with white tab labels; this composition never launches an agent or captures a real terminal.
