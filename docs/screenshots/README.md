# Demo screenshots

All twelve images were refreshed from **KlipRun Desktop 0.0.14** on **2026-10-17**. Session IDs, titles, project paths, models, priority flags, Git metadata, quotas, and usage totals come only from [`mock-api.json`](mock-api.json). The preview fixes the clock to the fixture’s `board.generated_at` (2026-10-14), supplies a stub desktop bridge, and disables Office motion. No live engine, user session store, credentials, quota API, or agent process is used.

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
| [`git-changes.png`](git-changes.png) | 1440 × 900 | Fictional staged/unstaged/untracked files and a line-numbered diff |
| [`git-branches.png`](git-branches.png) | 1440 × 900 | Branch popover with fictional commit metadata and a search/create field |
| [`git-history.png`](git-history.png) | 1440 × 900 | Fictional commits, refs, commit files and first-parent diff |
| [`shortcuts.png`](shortcuts.png) | 1600 × 1000 | Current in-app keyboard shortcut dialog |

The fixture API covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, `/api/stats/session/:id`, `/api/stats/office-usage`, and `/api/quota/:provider`. Statistics uses `statistics_dataset`, a fictional 60-day event and observation history, through the production aggregators. The `card_priorities` map supplies only fictional session IDs. The selected details session is `ses_demo_search`, matching the fixture’s `details` payload.

Build the client with `cd engine/src/client && bun run build`, then start `bun docs/screenshots/preview.ts` from the repository root. The fixture-only server binds to `127.0.0.1:18796` and serves the built client without starting a live engine.

[`capture-all.js`](capture-all.js) is an async Playwright callback taking `(page, outputDirectory = "docs/screenshots")`. It captures the nine non-Git images, checks the UI version and provider names, and rejects external requests. Invoke it with a directory on the Playwright host, or run from the repository root to use the default directory. [`capture-usage.js`](capture-usage.js) remains available for capturing Usage alone.

`desktop-terminal.png` combines the current `kanban-details.png` capture with [`terminal-demo.html`](terminal-demo.html), available at `/__demo/terminal-demo.html`. The terminal transcript and tabs are static fictional content with white tab labels; this composition never launches an agent or captures a real terminal.

The `git` fixture supplies repository roots, status, history, commit files, and diff patches for `/api/git/*`. The preview rejects Git actions and never invokes Git or accesses working repositories. [`capture-git.js`](capture-git.js) captures Changes, the branch popover, History, and shortcuts. The `git.status.branches` fixture includes only fictional author, date, and last-commit metadata. [`../../scripts/git-workspace.test.js`](../../scripts/git-workspace.test.js) covers the UI workflow and normal/small layouts with in-memory responses based on the same fixture; [`../../scripts/git-panel-resize.test.js`](../../scripts/git-panel-resize.test.js) covers panel resizing.

The 0.0.14 images show the icon-only toolbar in **Kanban → Git → Office → Usage → Statistics → Settings** order. Shortcuts use Control+1 Kanban, Control+2 Git, Control+3 Office, Control+4 Usage, and Control+5 Statistics. Both capture callbacks made **zero external requests**.
