# Demo screenshots

All seventeen images were captured from **KlipRun Desktop 0.0.21** on **2026-10-17**. Session IDs, titles, project paths, models, priority flags, Git metadata, quotas, and usage totals come only from [`mock-api.json`](mock-api.json). The preview fixes the clock to the fixture’s `board.generated_at` (2026-10-14), supplies a stub desktop bridge, and disables Office motion. No live engine, user session store, credentials, quota API, or agent process is used.

| File | Size | Example shown |
| --- | --- | --- |
| [`kanban.png`](kanban.png) | 1440 × 900 | Kanban columns, nested subagent, and synthetic Critical/Medium/Low flags |
| [`kanban-details.png`](kanban-details.png) | 1440 × 900 | Selected Implement search API session and the default Agents T details tab |
| [`recent-sessions.png`](recent-sessions.png) | 1600 × 1000 | Resized sidebar with compact title/project/time rows, search, bounded agent/project/updated filter controls, resume icons, and matching selected details |
| [`desktop-terminal.png`](desktop-terminal.png) | 1440 × 900 | Fixture-based board plus a static synthetic terminal panel |
| [`office.png`](office.png) | 1600 × 1200 | Fictional parent/helper team, Shared loft, model labels, and floor-plan controls |
| [`statistics.png`](statistics.png) | 1600 × 1600 | Last 30 days, latest sessions, Daily token activity, and composition in UTC |
| [`statistics-weekly.png`](statistics-weekly.png) | 1600 × 1600 | Weekly token activity for the same fictional dataset |
| [`usage.png`](usage.png) | 1600 × 900 | Compact provider rows with colored status dots and white limit/reset labels |
| [`git-files.png`](git-files.png) | 1440 × 900 | Repository tree on the right, preview/permanent file tabs and highlighted Python source |
| [`git-markdown.png`](git-markdown.png) | 1440 × 900 | Rendered Markdown with source/preview toggle and per-file editor status |
| [`git-notebook.png`](git-notebook.png) | 1440 × 900 | Jupyter Markdown/code cells with saved tables, text, and an embedded image |
| [`git-changes.png`](git-changes.png) | 1440 × 900 | Fictional changes in List/Path/None mode, staging controls, and a line-numbered diff |
| [`git-repository.png`](git-repository.png) | 1440 × 900 | Searchable repository dropdown with fictional project names and paths |
| [`git-changes-settings.png`](git-changes-settings.png) | 1440 × 900 | Changes settings menu with List/Tree, Path/Name, and three grouping choices |
| [`git-branches.png`](git-branches.png) | 1440 × 900 | Branch popover with fictional commit metadata and a search/create field |
| [`git-history.png`](git-history.png) | 1440 × 900 | Fictional commits, refs, commit files and first-parent diff |
| [`shortcuts.png`](shortcuts.png) | 1600 × 1000 | Current in-app keyboard shortcut dialog |

The fixture API covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, `/api/stats/session/:id`, `/api/stats/office-usage`, and `/api/quota/:provider`. Statistics uses `statistics_dataset`, a fictional 60-day event and observation history, through the production aggregators. The `card_priorities` map supplies only fictional session IDs. The selected details session is `ses_demo_search`, matching the fixture’s `details` payload.

`git.text_files["notebooks/activity.ipynb"]` is a fictional notebook with Markdown, Python cells, saved tables, text, and an embedded PNG. [`../../scripts/git-notebook.test.js`](../../scripts/git-notebook.test.js) is a Playwright callback `(page, base = "http://127.0.0.1:18796")` checking its default preview, saved outputs, JSON editing and save, invalid JSON fallback, metadata preservation, inactive HTML scripts and remote images, and layouts at 1440, 720, and 500 pixels. Its saves stay in memory.

Recent Sessions uses an in-memory `UsageStore` populated only from the fixture's `recent_sessions.sessions`. The preview applies the production query parser and metadata search/pagination to this fictional index. [`../../scripts/recent-sessions.test.js`](../../scripts/recent-sessions.test.js) covers search, combined filters, empty results, collapse/restore, resume, compact layouts, and paginated selection followed by Git navigation. Its pagination response is synthetic; no agent is launched.

[`../../scripts/recent-session-controls.test.js`](../../scripts/recent-session-controls.test.js) checks pointer/keyboard resizing, saved width, viewport limits, cancellation, and bounded filter menus at normal and small sizes. It adds 243 fictional project paths, including long paths, duplicate names and Cyrillic, to verify project search, scrolling, keyboard selection and dismissal. Both Recent Sessions scripts run in an isolated headless browser and make no external requests. The Recent Sessions image was refreshed on 2026-10-17 for these controls, at a manually expanded sidebar width of 288 pixels.

[`../../scripts/git-repository-discovery.test.js`](../../scripts/git-repository-discovery.test.js) adds a synthetic long project history to the fixture response and checks discovery against Bun's real HTTP header limit. It verifies bounded request URLs, successful batches, merged roots, and a Git view without an error; it does not read real repositories.

Build the client with `cd engine/src/client && bun run build`, then start `bun docs/screenshots/preview.ts` from the repository root. The fixture-only server binds to `127.0.0.1:18796` and serves the built client without starting a live engine.

[`../../scripts/git-repository-picker.test.js`](../../scripts/git-repository-picker.test.js) checks the searchable Git dropdown, keyboard selection, empty searches, and popup bounds in three window sizes. [`../../scripts/statistics-latest.test.js`](../../scripts/statistics-latest.test.js) checks the latest-session count, ordering, saved selection, detail navigation, small layouts, and empty/error states. These checks and the committed screenshots use the same fictional dataset.

[`capture-all.js`](capture-all.js) is an async Playwright callback taking `(page, outputDirectory = "docs/screenshots")`. It captures the nine non-Git images, checks the UI version and provider names, and rejects external requests. Invoke it with a directory on the Playwright host, or run from the repository root to use the default directory. [`capture-usage.js`](capture-usage.js) remains available for capturing Usage alone.

`desktop-terminal.png` combines the current `kanban-details.png` capture with [`terminal-demo.html`](terminal-demo.html), available at `/__demo/terminal-demo.html`. The terminal transcript and tabs are static fictional content with white tab labels; this composition never launches an agent or captures a real terminal.

The `git` fixture supplies repository roots, status, history, commit files, source text, and diff patches for `/api/git/*`. The preview rejects Git actions and never invokes Git or accesses working repositories. [`capture-git.js`](capture-git.js) captures Changes, its display-settings menu, the branch popover, History, and shortcuts. The `git.status.branches` fixture includes only fictional author, date, and last-commit metadata. [`../../scripts/git-workspace.test.js`](../../scripts/git-workspace.test.js) covers direct commit submission, message-field scrolling, the UI workflow, and normal/small layouts with in-memory responses based on the same fixture; [`../../scripts/git-panel-resize.test.js`](../../scripts/git-panel-resize.test.js) covers panel resizing. [`../../scripts/git-session-follow.test.js`](../../scripts/git-session-follow.test.js) covers session-driven repository selection, sessions without Git, per-repository drafts, nested folders, and switching sessions during a commit. [`../../scripts/git-changes-settings.test.js`](../../scripts/git-changes-settings.test.js) covers display settings, partial staging, saved options, keyboard navigation, and popup placement. These tests use fixture responses without modifying repositories.

`git.text_files` supplies fictional Python, SQL, Markdown, and TypeScript source for the Files tab. The preview serves `/api/git/files` and reads from `/api/git/file`; save requests are rejected. [`../../scripts/git-files.test.js`](../../scripts/git-files.test.js) is a Playwright callback `(page, fixture)` taking the parsed `mock-api.json`. It intercepts file requests and keeps simulated saves in memory, checking the right-hand project tree and its filter/keyboard controls, preview and permanent tabs, CodeMirror indentation/search/undo across tabs, save/close/cancel, Markdown preview, save conflicts, delayed responses, inactive drafts on repository changes, and normal/small windows.

The toolbar follows **Kanban → Git → Office → Usage → Statistics**, with a separate **Check for Updates → Keyboard shortcuts → Settings** utility group. Shortcuts use Control+1 Kanban, Control+2 Git, Control+3 Office, Control+4 Usage, and Control+5 Statistics. Both capture callbacks made **zero external requests**.

The Office image now shows the Shared loft floor plan with the same fictional sessions. [`../../scripts/office.test.js`](../../scripts/office.test.js) checks all three floor plans, persistent settings, new and removed helpers, observed-state transitions and idle grace, selection, active-terminal highlighting, usage, zoom, and reduced motion in normal and constrained web-view sizes.

[`../../scripts/git-review-layout.test.js`](../../scripts/git-review-layout.test.js) checks the compact repository toolbar, staging controls before filenames, loaded-commit search, keyboard navigation, automatic first-file diffs, persistent close, and small layouts using fixture data without Git writes.

[`capture-files.js`](capture-files.js) takes `(page, outputDirectory, fixture)` and captures Files, Markdown, and Jupyter Notebook from `git.text_files` in `mock-api.json`, with all file reads intercepted and no writes. All seventeen images were refreshed for 0.0.21.
