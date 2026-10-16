# Git workspace

Date: 2026-10-16

Status: approved and implemented locally; verification passed.

## Requested outcome

Add a Git tab immediately after Kanban. Implement the full basic Git workflow:
working-tree and staged diffs, commit history, branches, staging, committing,
fetching, pulling, and pushing. Follow the supplied reference screenshots while
preserving KlipRun's existing dark theme and embedded terminal layout. Fixed UI
copy remains English.

## Navigation

The tab and native View menu order is:

| Tab | Route | Shortcut |
| --- | --- | --- |
| Kanban | `/` | Control+1 |
| Git | `/git` | Control+2 |
| Statistics | `/stats` | Control+3 |
| Office | `/office` | Control+4 |
| Usage | `/usage` | Control+5 |

Update tooltip text, keyboard shortcut help, native navigation validation, and
startup-screen preferences together. Git navigation does not launch an agent or
open a hidden terminal dock.

## Interface and repositories

The main area displays the selected file's diff, with old/new line numbers and
colored additions/deletions. A right sidebar contains Changes and History tabs,
matching the reference layout. The initial state explains how to choose a file
or repository instead of leaving the main area blank.

The repository selector offers projects from available session cards and recent
sessions. Open Repository uses the native macOS directory picker so repositories
without agent sessions are also usable. Resolve selected directories to actual
Git roots, deduplicate roots, and treat separate worktrees as separate choices.
Selecting a session supplies an initial repository; an explicit repository choice
stays selected while the user works. Remember the last explicitly selected root.

Changes groups files into Staged, Unstaged, and Untracked with collapsible folder
trees, file statuses, and addition/deletion counts. Clicking a file loads the
corresponding diff. A file changed both in the index and the working tree appears
in both relevant groups. Support filenames containing spaces, Unicode, and Git
pathspec characters; correctly identify renames and deletions. Binary files,
submodules, and large or truncated diffs receive explicit states.

History displays commit subject, author, time, abbreviated hash, and branch/tag
labels. Load older commits on demand. Selecting a commit shows its metadata and
changed files; selecting a file shows that commit's diff. Handle initial commits
and merge commits with an explicit first-parent comparison.

Keep the branch selector and remote controls accessible in the sidebar footer,
with the commit message field and Commit button under Changes. The sidebar has
its own scroll region. At small widths use a stacked layout; scrolling and diff
access must also work with a visible terminal dock.

## Git operations

Use the system Git executable, without adding a Git library. The local Bun engine
owns Git subprocesses; the browser sends structured requests for named actions.

- Stage or unstage individual files and groups. Stage/Unstage All uses the
  corresponding current group. Unstaging must work before the first commit.
- Commit exactly the staged contents with a nonempty message. Disable Commit
  when nothing is staged or an operation is running. Preserve the message on
  failure and clear it after success.
- List local and remote-tracking branches, identify the current branch, and allow
  creating and switching branches. Switching a remote-tracking branch creates
  its local tracking branch when appropriate. Preserve Git's dirty-tree checks.
- Show upstream, ahead/behind counts, and detached/unborn HEAD states. Fetch,
  Pull, and Push use the selected branch's configured remote. Pull uses
  `--ff-only`; pushing a branch without an upstream offers Publish and establishes
  upstream tracking on the configured remote.
- Commit and remote writes show a confirmation naming the repository, branch,
  and operation. These product confirmations do not authorize this development
  session to commit, push, or publish the implementation.
- Show failures, missing identity, authentication problems, non-fast-forward
  updates, and conflicts with actionable messages. Refresh status after success
  or failure. Disable overlapping operations for a repository and keep stale
  requests from replacing a newly selected repository or diff.

Refresh Changes while Git is visible and when the app regains focus, plus offer
manual Refresh. Do not perform background remote network operations.

## API and boundaries

Add a focused server Git module and routes, shared request/response types, and a
lazy-loaded client Git view. Keep existing session-store access read-only.

Retain loopback binding and desktop-token authentication. Reject cross-origin
mutation requests, malformed JSON, unsupported actions, invalid revisions, and
paths outside the selected working tree. Resolve Git roots server-side and use
explicit argument arrays, literal file paths, and `--` separators. Never pass
browser text to a shell or accept arbitrary Git command arguments. Diff reading
must not follow an untracked symlink outside the repository.

Bound history pages, file sizes, subprocess output, and runtime. Run Git
asynchronously so it does not block board updates or other engine routes.
Disable interactive credential prompts and external diff/textconv execution.
Remote credentials stay in Git's existing configuration and credential helpers;
never return credential-bearing remote URLs or raw authentication secrets.
Render diff contents as text. Use Git's normal commit hooks and report failures.

## Implementation touchpoints

- `engine/src/server/`: Git service, routes, route registration, integration tests.
- `engine/src/shared/`: Git payload and action types.
- `engine/src/client/src/`: Git view, diff/file tree presentation, navigation,
  native bridge, shortcut help, and regression tests.
- `app/Sources/KlipRunDesktop/`: Git menu entry, shifted shortcuts, native folder
  selection, navigation allowlist, startup-screen choices.
- `app/Sources/KlipRunCore/AppPreferences.swift`: allow the Git startup route.
- `README.md` and `CHANGELOG.md`: document the workflow and shortcut changes.
- `docs/screenshots/`: extend the fictional API fixture and preview for Git
  visual checks; refresh the shortcut screenshot if committed images change.

Keep the current version aligned at 0.0.13. A release is outside this request.

## Verification

Use disposable repositories and local bare remotes to exercise status, unstaged
and staged diffs, untracked files, renames, deletions, unusual filenames, unborn
and detached HEAD, worktrees, history pagination, branch creation/switching,
stage/unstage, commit, fetch, pull, publish, and push. Verify dirty-tree and
non-fast-forward failures preserve user changes. Test malformed requests, path
escape, literal pathspec handling, and subprocess error/timeout handling.

Check client rendering and navigation, including stale responses and empty/error
states. Inspect the fixture-backed view at normal and small window sizes, with
and without space reserved for the terminal. Screenshots use only fictional data
from `docs/screenshots/mock-api.json`.

Run the engine/client tests, TypeScript checks, Swift tests, the app build,
`codesign --verify --deep --strict /private/tmp/KlipRun-git-preview.app`, and
`git diff --check`. The separate output bundle preserves the installed app.
Review the final diff. Do not terminate existing user agents or change the
development repository's commits, index, branches, or remotes during Git tests.

## Excluded from this first implementation

Partial-hunk staging, interactive conflict editing, stash management, rebase,
cherry-pick, branch deletion, destructive discard/reset controls, and force push.
The requested basic workflow operates on whole files and ordinary branches.

## Execution constraints

Local source edits, tests, builds, and fixture generation are authorized. Actual
commits, pushes, PR creation, GitHub metadata changes, and releases require
separate explicit approval in the current chat. This design stays local and
uncommitted until such approval exists.

## User refinements on 2026-10-17

Successful operations show a compact toast that disappears after 2.5 seconds.
The branch name shares the bottom row with Fetch/Pull/Push. One popover displays
local and remote branches with last-commit author, age and subject. It focuses
a single search/create field, supports arrow keys and Enter, and closes with
Escape or an outside click. Selecting a branch switches directly; typing a new
name and pressing Enter creates it at HEAD. The separate remote selector and
expanded branch form are removed. Remote operations use the configured/default
remote. Dirty-tree checks and expected-HEAD validation remain in the engine.

Pull runs immediately from its button, without a confirmation dialog or success
toast. It refreshes repository state after completion and displays failures.

Fetch, Push and Publish also run directly without a confirmation dialog or
success toast. The Git sidebar divider supports pointer and keyboard resizing
using the existing details-panel limits (320–850 px, reserving 340 px for the
diff), remembers the chosen width between view changes, and hides in the
stacked layout at 850 px and below. Errors remain visible.
