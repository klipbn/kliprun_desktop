import { describe, expect, test } from "bun:test";
import { isTuiCommand } from "../liveness";
import { openTuiSessions } from "../liveness";
import { chmodSync, copyFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test('fresh busy and retry heartbeats belong only to the exact live terminal session', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'kliprun-opencode-live-')));
  const executable = join(directory, 'opencode');
  // A disposable process with OpenCode's argv shape; no agent or user session is started.
  copyFileSync('/bin/sleep', executable); chmodSync(executable, 0o700);
  const child = Bun.spawn([executable, '30'], { cwd: directory });
  const session = 'ses_fixture_busy', file = join(directory, 'instance.json');
  const heartbeat = (status: string, extra: object = {}) => writeFileSync(file, JSON.stringify({
    pid: child.pid, directory, heartbeatAt: new Date().toISOString(), currentSessionID: session, currentSessionStatus: status, statusOk: true, ...extra,
  }));
  try {
    heartbeat('busy');
    const busy = await openTuiSessions(directory);
    expect(busy.sessionIds.has(session)).toBe(true);
    expect(busy.busyIds?.has(session)).toBe(true);
    expect(busy.sessionPids?.get(session)).toBe(String(child.pid));
    heartbeat('retry'); expect((await openTuiSessions(directory)).busyIds?.has(session)).toBe(true);
    heartbeat('idle'); expect((await openTuiSessions(directory)).busyIds?.has(session)).toBe(false);
    for (const extra of [{ heartbeatAt: new Date(Date.now() - 60_000).toISOString() }, { headless: true }, { directory: '/unrelated-project' }, { statusOk: false }]) {
      heartbeat('busy', extra); expect((await openTuiSessions(directory)).busyIds?.has(session)).toBe(false);
    }
    child.kill(); await child.exited;
    heartbeat('busy'); expect((await openTuiSessions(directory)).busyIds?.has(session)).toBe(false);
  } finally { child.kill(); await child.exited; rmSync(directory, { recursive: true, force: true }); }
});

describe("isTuiCommand", () => {
  test("bare opencode is a TUI", () => {
    expect(isTuiCommand("opencode")).toBe(true);
    expect(isTuiCommand("/usr/local/bin/opencode")).toBe(true);
    expect(isTuiCommand("opencode attach")).toBe(true);
    expect(isTuiCommand("opencode --port 1234")).toBe(true);
  });

  test("non-interactive subcommands are never a TUI", () => {
    expect(isTuiCommand("opencode run ls")).toBe(false);
    expect(isTuiCommand("opencode serve")).toBe(false);
    expect(isTuiCommand("opencode mcp")).toBe(false);
    expect(isTuiCommand("/opt/opencode serve --port 1")).toBe(false);
  });

  test("other binaries are not a TUI", () => {
    expect(isTuiCommand("bun run server.ts")).toBe(false);
    expect(isTuiCommand("vim")).toBe(false);
    expect(isTuiCommand("node opencode-wrapper.js")).toBe(false);
    expect(isTuiCommand("")).toBe(false);
  });
});
