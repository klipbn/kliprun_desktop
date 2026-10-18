# Demo screenshots

All nineteen current screenshots were captured from **KlipRun Desktop 0.0.24** on **2026-10-18**, using Graphite, the new default. The original palette is now named Midnight. Session IDs, titles, project paths, models, priority flags, Git metadata, quotas, and usage totals come only from [`mock-api.json`](mock-api.json). The preview fixes the clock to the fixture’s `board.generated_at` (2026-10-14), supplies a stub desktop bridge, and disables Office motion. No live engine, user session store, credentials, quota API, or agent process is used.

| File | Size | Example shown |
| --- | --- | --- |
| [`kanban.png`](kanban.png) | 1440 × 900 | Kanban columns, nested subagent, and synthetic Critical/Medium/Low flags |
| [`kanban-details.png`](kanban-details.png) | 1440 × 900 | Selected Implement search API session and the default Agents T details tab |
| [`sessions.png`](sessions.png) | 1440 × 900 | All sessions with project assignments, favorites, metrics, and No project |
| [`session-groups.png`](session-groups.png) | 1440 × 900 | Aurora with Research (2), Work (1), and Uncategorized (1) |
| [`desktop-terminal.png`](desktop-terminal.png) | 1440 × 900 | Fixture-based board plus a static synthetic terminal panel |
| [`office.png`](office.png) | 1600 × 1200 | Fictional parent/helper team, Shared loft, model labels, and floor-plan controls |
| [`statistics.png`](statistics.png) | 1600 × 1600 | Last 30 days, latest sessions, Daily token activity, and composition in UTC |
| [`statistics-weekly.png`](statistics-weekly.png) | 1600 × 1600 | Weekly token activity for the same fictional dataset |
| [`usage.png`](usage.png) | 1600 × 900 | Compact provider rows with colored status dots and white limit/reset labels |
| [`git-files.png`](git-files.png) | 1440 × 900 | Repository tree on the right, preview/permanent file tabs and highlighted Python source |
| [`git-file-menu.png`](git-file-menu.png) | 1440 × 900 | File context menu with rename, path copying, Finder, default app and ignore actions |
| [`git-markdown.png`](git-markdown.png) | 1440 × 900 | Rendered Markdown with source/preview toggle and per-file editor status |
| [`git-notebook.png`](git-notebook.png) | 1440 × 900 | Jupyter Markdown/code cells with saved tables, text, and an embedded image |
| [`git-changes.png`](git-changes.png) | 1440 × 900 | Fictional changes in List/Path/None mode, staging controls, and a line-numbered diff |
| [`git-repository.png`](git-repository.png) | 1440 × 900 | Searchable repository dropdown with fictional project names and paths |
| [`git-changes-settings.png`](git-changes-settings.png) | 1440 × 900 | Changes settings menu with List/Tree, Path/Name, and three grouping choices |
| [`git-branches.png`](git-branches.png) | 1440 × 900 | Branch popover with fictional commit metadata and a search/create field |
| [`git-history.png`](git-history.png) | 1440 × 900 | Fictional commits, refs, commit files and first-parent diff |
| [`shortcuts.png`](shortcuts.png) | 1600 × 1000 | Current in-app keyboard shortcut dialog |

The fixture API covers `/api/board`, `/api/session/:id`, `/api/recent-sessions`, `/api/stats`, `/api/stats/sessions`, `/api/stats/session/:id`, `/api/stats/office-usage`, and `/api/quota/:provider`. Statistics uses `statistics_dataset`, a fictional 60-day event and observation history, through the production aggregators. The `card_priorities` map supplies only fictional session IDs. The selected details session is `ses_demo_search`, matching the fixture’s `details` payload.

`git.text_files["notebooks/activity.ipynb"]` is a fictional notebook with Markdown, Python cells, saved tables, text, and an embedded PNG. [`../../scripts/git-notebook.test.js`](../../scripts/git-notebook.test.js) is a Playwright callback `(page, base = "http://127.0.0.1:18796")` checking its default preview, saved outputs, JSON editing and save, invalid JSON fallback, metadata preservation, inactive HTML scripts and remote images, bounded preview of a synthetic 5 MB HTML output, lazy JSON editor creation, and layouts at 1440, 720, and 500 pixels. Its saves stay in memory.

[`../../scripts/git-file-actions.test.js`](../../scripts/git-file-actions.test.js) checks file and folder context menus, native clipboard/Finder/default-app requests, folder drag and drop, rename, ignore, cancellation and saving of affected drafts, destination conflicts, Collapse all folders in Changes, and menu placement in three window sizes. Filesystem mutations and file saves stay in memory.

The Sessions catalog combines `recent_sessions.sessions` with observed runtime/model durations calculated from `statistics_dataset`; context uses `board`. `capture-all.js` assigns fictional projects and groups using these existing session IDs only. [`../../scripts/session-workspace.test.js`](../../scripts/session-workspace.test.js) checks groups, favorites, bulk moves, drag/drop, undo, persistence, metrics, filtering, Control+1–6, pagination across 212 fictional sessions, failure recovery, and normal/small layouts. The former sidebar tests have been replaced by this workspace coverage. The legacy `/api/recent-sessions` preview remains available for read-only API tests.

[`../../scripts/git-repository-discovery.test.js`](../../scripts/git-repository-discovery.test.js) adds a synthetic long project history to the fixture response and checks discovery against Bun's real HTTP header limit. It verifies bounded request URLs, successful batches, merged roots, and a Git view without an error; it does not read real repositories.

Build the client with `cd engine/src/client && bun run build`, then start `bun docs/screenshots/preview.ts` from the repository root. The fixture-only server binds to `127.0.0.1:18796` (override with `KLIPRUN_PREVIEW_PORT`) and serves the built client without starting a live engine.

[`../../scripts/git-repository-picker.test.js`](../../scripts/git-repository-picker.test.js) checks the searchable Git dropdown, keyboard selection, empty searches, and popup bounds in three window sizes. [`../../scripts/statistics-latest.test.js`](../../scripts/statistics-latest.test.js) checks the latest-session count, ordering, saved selection, detail navigation, small layouts, and empty/error states. These checks and the committed screenshots use the same fictional dataset.

[`capture-all.js`](capture-all.js) is an async Playwright callback taking `(page, outputDirectory = "docs/screenshots", base = "http://127.0.0.1:18796")`. It captures the ten current non-Git images, checks the UI version and provider names, and rejects external requests. Invoke it with a directory on the Playwright host, or run from the repository root to use the default directory. [`capture-usage.js`](capture-usage.js) remains available for capturing Usage alone.

`desktop-terminal.png` combines the current `kanban-details.png` capture with [`terminal-demo.html`](terminal-demo.html), available at `/__demo/terminal-demo.html`. The terminal transcript and tabs are static fictional content with white tab labels; this composition never launches an agent or captures a real terminal.

The `git` fixture supplies repository roots, status, history, commit files, source text, and diff patches for `/api/git/*`. The preview rejects Git actions and never invokes Git or accesses working repositories. [`capture-git.js`](capture-git.js) captures Changes, its display-settings menu, the branch popover, History, and shortcuts. The `git.status.branches` fixture includes only fictional author, date, and last-commit metadata. [`../../scripts/git-workspace.test.js`](../../scripts/git-workspace.test.js) covers direct commit submission, message-field scrolling, the UI workflow, and normal/small layouts with in-memory responses based on the same fixture; [`../../scripts/git-panel-resize.test.js`](../../scripts/git-panel-resize.test.js) covers panel resizing. [`../../scripts/git-session-follow.test.js`](../../scripts/git-session-follow.test.js) covers session-driven repository selection, sessions without Git, per-repository drafts, nested folders, and switching sessions during a commit. [`../../scripts/git-changes-settings.test.js`](../../scripts/git-changes-settings.test.js) covers display settings, partial staging, saved options, keyboard navigation, and popup placement. These tests use fixture responses without modifying repositories.

`git.text_files` supplies fictional Python, SQL, Markdown, and TypeScript source for the Files tab. The preview serves `/api/git/files` and reads from `/api/git/file`; save requests are rejected. [`../../scripts/git-files.test.js`](../../scripts/git-files.test.js) is a Playwright callback `(page, fixture)` taking the parsed `mock-api.json`. It intercepts file requests and keeps simulated saves in memory, checking the right-hand project tree and its filter/keyboard controls, preview and permanent tabs, CodeMirror indentation/search/undo across tabs, save/close/cancel, Markdown preview, save conflicts, delayed responses, inactive drafts on repository changes, and normal/small windows.

The toolbar follows **Sessions → Kanban → Office → Git → Usage → Statistics**, with a separate **Check for Updates → Keyboard shortcuts → Settings** utility group. Shortcuts use Control+1 Sessions, Control+2 Kanban, Control+3 Office, Control+4 Git, Control+5 Usage, and Control+6 Statistics. Both capture callbacks made **zero external requests**.

The Office image now shows the Shared loft floor plan with the same fictional sessions. [`../../scripts/office.test.js`](../../scripts/office.test.js) checks all three floor plans, persistent settings, new and removed helpers, observed-state transitions and idle grace, selection, active-terminal highlighting, usage, zoom, and reduced motion in normal and constrained web-view sizes.

[`../../scripts/office-density.test.js`](../../scripts/office-density.test.js) expands the fictional fixture into 45 coworkers and 24 separate project rooms. It checks all three floor plans in five window sizes, including very short windows, for horizontal space use and clipping. Review screenshots stay in `/private/tmp`; they are not the committed demo screenshots.

Office includes an EXIT door in the lower central passage. [`../../scripts/office-exit.test.js`](../../scripts/office-exit.test.js) uses only fixture sessions and deterministic animation frames to check that roots and helpers remain visible while walking, disappear only at the door, cancel departure on reappearance, leave live counts immediately, and respect reduced motion. It also checks resizing during departure and delays the empty-office overlay until the last character has left. Review images are written to `/private/tmp`.

Klopik skin thumbnails in `engine/src/client/public/klopik-skins/` are generated from the live SVG `Mascot` component, with four fictional color/variant examples per set. Run `bun scripts/render-klopik-previews.tsx` from `engine/src/client`, then pass the emitted HTML to [`capture-klopik-skins.js`](capture-klopik-skins.js). This captures six transparent PNG strips; the app build copies them into `Resources/KlopikSkins` for native Appearance settings. [`../../scripts/office-skins.test.js`](../../scripts/office-skins.test.js) verifies six skins across 36 layout/size combinations, live preference changes, matching leaderboard avatars, stable variations, working animation, reduced motion, and restoration of Default artwork. Review screenshots contain only fixture sessions and are saved under `/private/tmp`.

[`../../scripts/git-review-layout.test.js`](../../scripts/git-review-layout.test.js) checks the compact repository toolbar, staging controls before filenames, loaded-commit search, keyboard navigation, automatic first-file diffs, persistent close, and small layouts using fixture data without Git writes.

[`capture-files.js`](capture-files.js) takes `(page, outputDirectory, fixture, base)` and captures Files, its context menu, Markdown, and Jupyter Notebook from `git.text_files` in `mock-api.json`, with all file reads intercepted and no writes. All nineteen current images were refreshed for 0.0.24.

The shortcut image includes the native File/Edit/View/Navigate/Terminal commands. `scripts/native-menus.test.js` verifies the real web command bridge using fixture files and in-memory saves, including CodeMirror history, native-menu capability updates, unsaved-state reporting, close/cancel and draft-preserving refresh. Native focus/routing and standard menu shortcuts are checked separately with Swift tests and a disposable menu probe.
