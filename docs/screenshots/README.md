# Demo screenshots

These images show the real KlipRun web interface with **fictional data** from [`mock-api.json`](mock-api.json). Every session ID, task title, project path, model total, and usage metric in the fixture is an example. The screenshots were captured at a fixed date (2026-10-14) with `/api/*` requests intercepted locally; they were not taken from a user's live agent stores or terminal.

| File | Example shown |
| --- | --- |
| [`kanban.png`](kanban.png) | Kanban columns and nested subagent |
| [`kanban-details.png`](kanban-details.png) | Selected card and session activity |
| [`office.png`](office.png) | Work, idle, and meeting areas with synthetic coworkers |
| [`statistics.png`](statistics.png) | Seven days of synthetic usage, timezone UTC |
| [`shortcuts.png`](shortcuts.png) | In-app keyboard shortcut guide |

The mock API payload covers `/api/board`, `/api/session/:id`, `/api/stats`, `/api/stats/sessions`, and `/api/stats/office-usage`. When updating screenshots, serve the built `engine/src/client/dist` without a live engine, intercept those routes with the fixture, and verify that names and paths still refer only to the demo data before committing the images.
