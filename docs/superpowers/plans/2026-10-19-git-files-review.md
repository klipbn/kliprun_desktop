# Git Files: inline changes and ignored entries

Authorized in this chat: make Files show actual changes and ignored entries,
using Zed's editor gutter, expandable hunks, and project-panel behavior as the
reference. Preserve earlier uncommitted toolbar/Office/Sessions work. No commits,
pushes, releases, or live-agent changes. `update_plan` is unavailable; this file
tracks execution.

References: https://zed.dev/docs/git and https://zed.dev/docs/project-panel.

## 1. Ignored files and folders — completed

- [x] Add failing server regressions for ignored file/folder discovery, lazy
  directory loading, open/save, literal names, and existing repository boundaries.
- [x] Extend `GitFileList` with optional directory/ignored metadata. Include
  ignored roots without traversing whole dependency/build trees; load one level
  through `GET /api/git/files?directory=…&path=…` when expanded.
- [x] Allow regular ignored text files to open/save under the same root, size,
  encoding, revision, symlink, metadata and nested-repository checks.
- [x] Render ignored entries with subdued styling, default them visible but
  collapsed, add Show/Hide ignored files, and persist that preference through the
  existing generic Git workspace store. Verify server and tree regressions.

## 2. Editor changes — completed

- [x] Add failing API regressions for HEAD baselines, staged and unstaged changes,
  untracked/unborn files, renames, ignored files, and unavailable/large baselines.
- [x] Add a read-only file-base route, constrained to a valid selected-repository
  file; preserve existing current-file reads and saves.
- [x] Add official `@codemirror/merge` for its bounded diff algorithm. Keep the
  existing editor and undo history, add added/modified/deleted gutter indicators,
  click/keyboard hunk expansion, Escape collapse, Show/Hide changes, and counters.
  Diff the current draft against HEAD; handle CRLF, empty files and EOF deletions.
- [x] Refresh the baseline on repository refresh, file activation and HEAD
  changes; never replace unsaved text or save while displaying a diff.
- [x] Refresh clean open documents on status updates and activation so agent
  edits appear without reopening. Guard reads with the exact file snapshot,
  revision, path and root; preserve dirty/saving files and late edits. A browser
  regression failed before implementation and passed with the guarded refresh.
- [x] Verify focused API, editor-state, and fixture-only browser regressions:
  17 API tests, 28 focused client tests, and the complete fixture browser check.
  Follow-up regressions cover UTF-8 byte limits, CRLF/CR preservation, clean-file
  refresh, HEAD expansion reset, and exact line/gutter alignment after inline widgets.

## 3. Fixtures, docs and final verification — completed

- [x] Extend mock data and the preview for ignored folders and saved Git baselines;
  keep screenshots fictional and write review screenshots only to /private/tmp.
- [x] Update README and Unreleased CHANGELOG with actual controls and behavior.
- [x] Run all engine/client tests and the production client build; verify browser
  editing/undo/save, inline changes, ignored loading, repository switching, and
  normal/narrow/light/dark layouts. Inspect final diff and whitespace.
- [x] Build a separate review app and verify its signature and packaged sources;
  do not replace any existing app bundle.
- [x] Report actual results and any remaining limitations. Do not replace or
  restart the running user's app; no release/version bump was requested.

Verified result: 285 server/shared tests and 168 client tests passed (453 total).
Engine type checking and production client/app builds passed. Browser checks
passed for the new inline/ignored review, existing file tabs/editing/save flows,
file actions, and isolated HTML preview. The new check also verifies exact gutter
alignment, additions/deletions, safe baseline HTML, agent updates, and dirty-draft
preservation at normal/narrow sizes and in both light/dark themes. Browser saves
were in memory, with zero Git writes.

Final artifact: `/private/tmp/KlipRun-git-files-ready-20261019.app`. Strict deep
codesign verification passed. All 32 packaged client files and changed server /
shared sources match the checked build. Versions remain aligned at 0.0.26.
Final diff and tracked/new-file whitespace checks passed. Only disposable test
repos and owned preview/browser processes were used; the preview was stopped.
Earlier uncommitted work was preserved and no running app bundle was replaced.
