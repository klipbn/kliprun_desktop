import { afterEach, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeAdapter } from "../claude/adapter";
import { parseClaudeProcesses, parseClaudeFiles, claudeSessionRecord } from "../claude/liveness";
import { BoardService } from "../boardService";
import { StatusHistoryStore } from "../history";
import { Hono } from "hono";
import { registerSessionRoute, registerTerminalLinksRoute } from "../routes/api";
import { UsageImporter } from "../usage/importer";
import { UsageStore } from "../usage/store";
import { parseRecentSessionsQuery } from "../usage/recent";
import { parseStatsFilters } from "../usage/time";
import { readClaudeJournal } from "../claude/journal";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const id = "01900000-0000-7000-8000-000000000001";
const at = Date.parse("2026-10-18T12:00:00Z");
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "kliprun-claude-")); homes.push(home);
  const project = join(home, "projects", "-demo"); mkdirSync(project, { recursive: true });
  const path = join(project, `${id}.jsonl`);
  const entry = (type: string, values: Record<string, unknown> = {}, seconds = 0) => JSON.stringify({ type, sessionId: id, cwd: "/demo", uuid: `${type}-${seconds}`, timestamp: new Date(at + seconds * 1000).toISOString(), ...values }) + "\n";
  writeFileSync(path, entry("user", { message: { role: "user", content: "Implement search" } }));
  const adapter = new ClaudeAdapter(home);
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, startedAt: "generation-1" }]);
  return { home, path, entry, adapter };
}

test("Claude cards expose prompts, tools, waiting, completion and exclusive token categories", () => {
  const { adapter, path, entry } = fixture();
  expect(adapter.cards(at)[0]).toMatchObject({ source: "claude", session_id: `claude:${id}`, title: "Implement search", column: "running" });
  appendFileSync(path, entry("assistant", { message: { id: "msg_1", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "tool1", name: "AskUserQuestion", input: { secret: "never shown" } }], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 30, output_tokens_details: { thinking_tokens: 5 } } } }, 1));
  expect(adapter.cards(at + 1000)[0]).toMatchObject({ column: "attention", last_tool: "AskUserQuestion", tokens_total: 200, model_ref: "anthropic/claude-sonnet-4-6" });
  appendFileSync(path, entry("user", { message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool1", content: "Yes" }] } }, 2));
  expect(adapter.cards(at + 2000)[0].column).toBe("running");
  appendFileSync(path, entry("assistant", { message: { id: "msg_2", model: "claude-sonnet-4-6", stop_reason: "end_turn", content: [{ type: "text", text: "Done. token=private-value" }], usage: { input_tokens: 10, output_tokens: 5 } } }, 3));
  expect(adapter.cards(at + 3000)[0]).toMatchObject({ column: "idle", finished_at: at + 3000, tokens_total: 215 });
  const detail = adapter.detail(`claude:${id}`, at + 3000);
  expect(detail.models[0].tokens).toEqual({ input: 110, output: 20, reasoning: 5, cache_read: 50, cache_write: 30, total: 215 });
  // Newest first, as for OpenCode and Codex.
  expect(detail.messages.map(message => message.role)).toEqual(["assistant", "assistant", "user"]);
  expect(detail.messages[0].text).toContain("Done.");
  expect(JSON.stringify(detail)).not.toContain("never shown");
  expect(JSON.stringify(detail)).not.toContain("private-value");
  expect(adapter.terminalLinks()).toEqual([{ session_id: `claude:${id}`, pid: 42 }]);
  adapter.setProcesses([]);
  expect(adapter.cards(at + 4000)).toEqual([]);
  expect(adapter.detail(`claude:${id}`, at + 4000).exists).toBe(true);
});

test("streamed assistant snapshots are counted once and partial or malformed lines are tolerated", () => {
  const { adapter, path, entry } = fixture();
  const assistant = (output: number) => ({ message: { id: "msg_same", model: "claude-sonnet-4-6", stop_reason: "end_turn", content: [{ type: "text", text: "Answer" }], usage: { input_tokens: 100, output_tokens: output } } });
  appendFileSync(path, entry("assistant", assistant(1), 1) + "broken json\n" + entry("assistant", assistant(5), 2));
  const partial = entry("user", { message: { content: "Next" } }, 3);
  appendFileSync(path, partial.slice(0, -2));
  expect(adapter.cards(at + 3000)[0]).toMatchObject({ column: "idle", tokens_total: 105, message_count: 2 });
  appendFileSync(path, partial.slice(-2));
  expect(adapter.cards(at + 4000)[0]).toMatchObject({ column: "running", message_count: 3 });
  writeFileSync(path, entry("user", { message: { content: "Rewritten" } }));
  expect(adapter.cards(at + 5000)[0]).toMatchObject({ tokens_total: null, title: "Rewritten" });
});

test("ambiguous terminals stay unlinked and stale running turns become unknown", () => {
  const { adapter } = fixture();
  adapter.setProcesses([{ pid: "43", cwd: "/demo", startedAt: "new-generation" }]);
  const unresolved = adapter.cards(at)[0];
  expect(unresolved).toMatchObject({ stage: "Status unknown", terminal: { session_id: null } });
  expect(adapter.terminalLinks()).toEqual([]);
  expect(adapter.historyCards()).toEqual([]);
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id }]);
  expect(adapter.cards(at + 16 * 60_000)[0]).toMatchObject({ column: "idle", stage: "Status unknown" });
});

test("Claude slash commands are not prompts, interruptions finish turns and titles follow Claude's naming", () => {
  const { path, entry, adapter } = fixture();
  appendFileSync(path, entry("ai-title", { aiTitle: "Search feature" }, 1));
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, name: "demo-c5" }]);
  expect(adapter.cards(at + 1000)[0]).toMatchObject({ title: "Search feature", prompt_snippet: "Implement search" });
  appendFileSync(path, entry("user", { message: { role: "user", content: "[Request interrupted by user]" } }, 2));
  expect(adapter.cards(at + 2000)[0]).toMatchObject({ column: "idle", stage: "Interrupted", prompt_snippet: "Implement search" });
  appendFileSync(path, entry("user", { message: { role: "user", content: "<command-name>/clear</command-name>\n<command-args></command-args>" } }, 3));
  expect(adapter.cards(at + 3000)[0]).toMatchObject({ column: "idle", prompt_snippet: "Implement search" });
  appendFileSync(path, entry("custom-title", { customTitle: "Renamed" }, 4) + entry("ai-title", { aiTitle: "Later AI title" }, 5));
  expect(adapter.cards(at + 5000)[0].title).toBe("Renamed");
  const fresh = readClaudeJournal(path, at + 5000);
  expect(fresh.messages.filter(m => m.role === "user").map(m => m.text)).toEqual(["Implement search"]);
});

test("confirmed native Claude status reports permission prompts and resumes without journal writes", () => {
  const { adapter } = fixture();
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, status: "waiting", statusUpdatedAt: at + 1000 }]);
  expect(adapter.cards(at + 1000)[0]).toMatchObject({ column: "attention", stage: "Waiting for input", stage_since: at + 1000 });
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, status: "busy", statusUpdatedAt: at + 2000 }]);
  expect(adapter.cards(at + 2000)[0]).toMatchObject({ column: "running", stage: "Working", stage_since: at + 2000 });
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, status: "idle", statusUpdatedAt: at - 1000 }]);
  expect(adapter.cards(at + 2000)[0].column).toBe("running");
});

test("Claude keeps the original project and live session link after working in a subdirectory", () => {
  const { adapter, path, entry } = fixture();
  appendFileSync(path, entry("assistant", { cwd: "/demo/output", message: { id: "subdirectory", content: [{ type: "text", text: "Working in output" }] } }, 1));
  adapter.setProcesses([{ pid: "42", cwd: "/demo", sessionId: id, status: "waiting", statusUpdatedAt: at + 2000 }]);

  expect(adapter.cards(at + 2000)[0]).toMatchObject({ session_id: `claude:${id}`, directory: "/demo", column: "attention", stage: "Waiting for input" });
  expect(adapter.terminalLinks()).toEqual([{ session_id: `claude:${id}`, pid: 42 }]);
  expect(adapter.historyCards()).toHaveLength(1);
  expect(adapter.detail(`claude:${id}`, at + 2000)).toMatchObject({ exists: true, directory: "/demo" });
  expect(readClaudeJournal(path, at + 2000, Infinity).session.directory).toBe("/demo");

  adapter.setProcesses([{ pid: "42", cwd: "/other", sessionId: id }]);
  expect(adapter.cards(at + 2000)[0]).toMatchObject({ session_id: "claude-terminal:42", stage: "Status unknown" });
  expect(adapter.terminalLinks()).toEqual([]);
});

test("large Claude journals retain head metadata while board reads stay bounded and statistics read all usage", async () => {
  const { adapter, path, entry } = fixture();
  appendFileSync(path, entry("assistant", { cwd: "/demo/output", message: { id: "early", model: "claude-sonnet-4-6", stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 5 } } }, 1));
  for (let i = 0; i < 6; i++) appendFileSync(path, JSON.stringify({ type: "api-request-blob", ignored: "x".repeat(900_000) }) + "\n");
  appendFileSync(path, entry("user", { message: { content: "Continue search" } }, 2));
  appendFileSync(path, entry("assistant", { message: { id: "late", model: "claude-sonnet-4-6", stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 5, context_window: 1000 } } }, 3));
  expect(adapter.cards(at + 3000)[0]).toMatchObject({ session_id: `claude:${id}`, directory: "/demo", title: "Implement search", tokens_total: null, context: { used: 65, limit: 1000, percent: 7 } });
  const complete = readClaudeJournal(path, at + 3000, Infinity);
  expect(complete.session.directory).toBe("/demo");
  expect(complete.tokens).toBe(120);
  expect(complete.events.filter(e => e.kind === "turn")).toHaveLength(2);
});

test("Claude CLI recognition excludes noninteractive and unrelated processes", () => {
  expect(parseClaudeProcesses(`42 ttys001 /Users/test/.local/bin/claude\n43 ttys002 claude --resume ${id}\n44 ttys003 claude -p hello\n45 ?? claude\n46 ttys004 node server.js\n47 ttys005 claude mcp serve\n48 ttys006 claude --version`)).toEqual(["42", "43"]);
  expect(parseClaudeFiles(`p42\nfcwd\nn/demo\nf10\nn/config/projects/-demo/${id}.jsonl\n`, ["42"], "/config")).toEqual([{ pid: "42", cwd: "/demo", sessionId: id }]);
  expect(parseClaudeProcesses("49 ttys007 node /opt/lib/node_modules/@anthropic-ai/claude-code/cli.js --model sonnet")).toEqual(["49"]);
});

test("Claude native records reject reused PIDs and different working directories", () => {
  const process = { pid: "42", cwd: "/demo" }, startedAt = new Date(at).toString();
  const data = { pid: 42, cwd: "/demo", sessionId: id, startedAt: at + 500, status: "waiting", statusUpdatedAt: at + 1000 };
  expect(claudeSessionRecord(process, startedAt, data)).toMatchObject({ sessionId: id, status: "waiting" });
  expect(claudeSessionRecord(process, startedAt, { ...data, startedAt: at - 60_000 })).toBeNull();
  expect(claudeSessionRecord(process, startedAt, { ...data, startedAt: at + 30 * 60_000 })).toMatchObject({ sessionId: id });
  expect(claudeSessionRecord(process, startedAt, { ...data, pid: 43 })).toBeNull();
  expect(claudeSessionRecord(process, startedAt, { ...data, cwd: "/other" })).toBeNull();
  expect(claudeSessionRecord(process, startedAt, { ...data, sessionId: "../../settings" })).toBeNull();
});

test("Claude usage without a recorded model is counted and marked incomplete", () => {
  const { adapter, path, entry } = fixture();
  appendFileSync(path, entry("assistant", { message: { id: "unknown-model", stop_reason: "end_turn", content: [{ type: "text", text: "Done" }], usage: { input_tokens: 5, output_tokens: 2 } } }, 1));
  expect(adapter.cards(at + 1000)[0]).toMatchObject({ tokens_total: 7, model_ref: null });
  expect(readClaudeJournal(path, at + 1000).events.find(e => e.kind === "usage")).toMatchObject({ model: null, incomplete: true, tokens: { total: 7 } });
});

test("Claude reaches board, status history, detail API and terminal links alongside other agents", async () => {
  const { adapter } = fixture();
  const empty = { columns: { attention: { title: "Needs attention", count: 0, cards: [] }, running: { title: "Running", count: 0, cards: [] }, idle: { title: "IDLE", count: 0, cards: [] } }, agents: [], agent_stats: { working: 0, resting: 0 }, project_count: 0, generated_at: at };
  const service = new BoardService({ claude: adapter, history: new StatusHistoryStore(":memory:"),
    engine: { rebuild() {}, board: () => empty, historyCards: () => [], setTuiLiveness: () => false, sessionDirectory: () => null, detail: () => ({ messages: [], models: [] }) } });
  try {
    const app = new Hono(); registerSessionRoute(app, service); registerTerminalLinksRoute(app, service);
    const board = service.getBoard().data;
    expect(Object.values(board.columns).flatMap(c => c.cards)).toContainEqual(expect.objectContaining({ source: "claude", session_id: `claude:${id}` }));
    const detail = await app.request(`/api/session/claude:${id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ source: "claude", exists: true, directory: "/demo", kanban_history: [expect.anything()] });
    expect(await (await app.request("/api/terminal-links")).json()).toMatchObject({ links: [{ pid: 42, session_id: `claude:${id}` }] });
    expect((await app.request("/api/session/claude:../../settings.json")).status).not.toBe(200);
  } finally { service.stop(); }
});

test("Claude history imports idempotently with source filters and updated usage", async () => {
  const { home, path, entry } = fixture();
  appendFileSync(path, entry("assistant", { message: { id: "msg_1", model: "claude-sonnet-4-6", stop_reason: "end_turn", content: [{ type: "text", text: "Done" }], usage: { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 20 } } }, 1));
  const store = new UsageStore(":memory:");
  try {
    const importer = new UsageImporter({ opencodePath: join(home, "absent.db"), codexHome: join(home, "absent"), claudeHome: home }, store);
    await importer.runOnce(); await importer.runOnce();
    expect(importer.status.find(s => s.source === "claude")).toMatchObject({ state: "ready", indexed: 1 });
    const sessions = store.recentSessions(parseRecentSessionsQuery(new URL("http://localhost/?source=claude")));
    expect(sessions.sessions).toMatchObject([{ id: `claude:${id}`, source: "claude", title: "Implement search" }]);
    expect(store.officeUsage([`claude:${id}`]).rows[0].tokens).toBe(125);
    expect(parseStatsFilters(new URL("http://localhost/?source=claude")).sources).toEqual(["claude"]);
    appendFileSync(path, entry("assistant", { message: { id: "msg_1", model: "claude-sonnet-4-6", stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 20 } } }, 2));
    await importer.runOnce();
    expect(store.officeUsage([`claude:${id}`]).rows[0].tokens).toBe(130);
  } finally { store.close(); }
});
