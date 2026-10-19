# Session catalog recovery implementation plan

> **For agentic workers:** Execute this focused fix inline with regression-first verification. Do not delegate, commit, publish, replace the installed app, or stop user processes.

**Goal:** Recover Sessions after a temporary statistics initialization failure when the user retries or the normal refresh runs.

**Architecture:** Retain statistics initialization options in `StatsService`. After a failed initialization, the next query replaces the failed worker and shares one new initialization across concurrent requests. Ignore late events from replaced workers. Preserve the existing failure behavior for a worker that dies after successful startup.

**Tech Stack:** TypeScript, Bun workers, SQLite, Hono, bun:test.

**Spec:** The current user report: Sessions shows “Unable to refresh sessions. Your saved organization is unchanged. Retry”. The live app returns HTTP 503 for catalog and recent sessions; SQLite quick checks and a separate worker on snapshots succeed.

## Constraints

- Keep the loopback token requirement and read-only agent-store access.
- Do not modify session organization, user databases, or running processes.
- Do not change versions or publish a release.
- `update_plan` is unavailable in this tool session; track execution here.

## Task 1: Recover failed startup on the next query

**State:** completed

**Files:**
- Modify: `engine/src/server/usage/service.ts` — initialization and worker lifecycle.
- Test: `engine/src/server/__tests__/usageApi.test.ts` — exercise actual SQLite locks and HTTP responses.
- Modify: `README.md` and `CHANGELOG.md` — explain Retry recovery.

**Interface:** `GET /api/session-catalog` initially returns 503 while the usage database is locked, then returns 200 with existing sessions after the lock is released. Concurrent refreshes share recovery. Existing post-startup worker failure responses remain bounded.

- [x] Add a real integration test: seed a temporary `UsageStore` with `ses_recovered`, close it, hold `BEGIN IMMEDIATE` through a second SQLite connection, create `StatsService`, and assert the catalog returns 503. Release the lock, request catalog and recent sessions concurrently, and assert both return 200 and retain `ses_recovered`.
- [x] Run `bun test src/server/__tests__/usageApi.test.ts -t 'temporary statistics startup lock'` from `engine`; confirm the recovery assertion fails with 503 instead of 200. Observed the expected failure: received 503 at the recovery assertion.
- [x] Retain resolved `StatsOptions` in the service, extract worker startup, record initialization rejection, and replace that worker on the next query before sending requests. Ignore events from workers that are no longer current; reject queries after service closure before starting recovery.
- [x] Rerun the focused test and the whole API test file. Verify repeated failed initialization, concurrent recovery, successful observations after recovery, and bounded shutdown. API tests: 11 passed, 0 failed, including new observations and querying after closure.
- [x] Document recovery in README and Unreleased changelog; preserve all version fields.

## Task 2: Verify the completed change

**State:** completed

- [x] Run `bun run test` and `bun run typecheck` from `engine`. All 454 tests passed (286 server/shared, 168 client); typecheck exited 0. The first sandboxed test run hit loopback EPERM; rerunning with approved permissions passed.
- [x] Run `zsh scripts/build.sh` with `KLIPRUN_APP_OUTPUT` pointing to a separate disposable app path under `/private/tmp`; do not replace any running bundle. Completed at `/private/tmp/kliprun-sessions-recovery-20261019/KlipRun.app`; the sandboxed attempt reached iconutil but failed, and the approved retry completed.
- [x] Verify that bundle with `codesign --verify --deep --strict`. Verification exited 0; `cmp` also confirmed the bundled service matches the fixed source.
- [x] Run `git diff --check`, inspect the complete diff and status, and report the remaining installed-app limitation. Diff checks passed. The installed app remains untouched; the local fix has not been released or installed. Removed the diagnostic database snapshots after verification.
