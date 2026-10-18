import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ColumnKey, DetailMessage, ModelUsageSummary, ToolEntry } from "@shared/types";
import type { UsageEvent, UsageSession } from "@shared/usage";
import { STALE_STREAM_MS } from "@shared/constants";
import { nonnegative, normalizeClaudeTokens, record } from "../usage/normalize";
import { scrub } from "../security";

export const CLAUDE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const claudeHome = () => process.env.KLIPRUN_BUN_CLAUDE_HOME ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const MAX_READ = 4 * 1024 * 1024;
const MAX_LINE = 1024 * 1024;
const string = (v: unknown): string | null => typeof v === "string" ? v : null;

/** Only root CLI journals, never debug logs, API request blobs, or helper transcripts. */
export function claudeJournals(home: string): string[] {
  const projects = join(home, "projects");
  const paths: string[] = [];
  for (const project of readdirSync(projects, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    try {
      for (const file of readdirSync(join(projects, project.name), { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith(".jsonl") && CLAUDE_ID.test(file.name.slice(0, -6))) paths.push(join(projects, project.name, file.name));
      }
    } catch { /* project removed during discovery */ }
  }
  return paths;
}

function* entries(path: string, maxBytes: number, tail = true): Generator<Record<string, unknown>> {
  const fileSize = statSync(path).size;
  const size = tail ? fileSize : Math.min(fileSize, maxBytes);
  const fd = openSync(path, "r");
  let offset = tail ? Math.max(0, size - maxBytes) : 0, skipping = offset > 0, partial = Buffer.alloc(0);
  try {
    while (offset < size) {
      const chunk = Buffer.alloc(Math.min(MAX_LINE, size - offset));
      const length = readSync(fd, chunk, 0, chunk.length, offset);
      if (!length) break;
      offset += length;
      const data = Buffer.concat([partial, chunk.subarray(0, length)]);
      let start = 0;
      for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, start)) {
        if (!skipping && end - start <= MAX_LINE && end > start) {
          try { yield record(JSON.parse(data.subarray(start, end).toString("utf8"))); } catch { /* malformed record */ }
        }
        skipping = false; start = end + 1;
      }
      if (skipping || data.length - start > MAX_LINE) { partial = Buffer.alloc(0); skipping = true; }
      else partial = Buffer.from(data.subarray(start));
    }
  } finally { closeSync(fd); }
}

export interface ClaudeJournal {
  session: UsageSession;
  column: ColumnKey;
  stage: string;
  since: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastEventAt: number;
  lastTool: string | null;
  prompt: string | null;
  model: string | null;
  contextTokens: number | null;
  contextLimit: number | null;
  tokens: number | null;
  error: string | null;
  messages: DetailMessage[];
  models: ModelUsageSummary[];
  events: UsageEvent[];
}

/** Bounded board reads; the statistics worker explicitly reads the complete journal. */
export function readClaudeJournal(path: string, now: number, maxBytes = MAX_READ): ClaudeJournal {
  const id = basename(path, ".jsonl");
  if (!CLAUDE_ID.test(id)) throw new Error("Invalid Claude session id");
  const state: ClaudeJournal = { session: { id: `claude:${id}`, source: "claude", parent_id: null, title: "Claude Code", directory: "", created_at: 0, updated_at: 0 },
    column: "idle", stage: "Status unknown", since: 0, startedAt: null, finishedAt: null, lastEventAt: 0, lastTool: null,
    prompt: null, model: null, contextTokens: null, contextLimit: null, tokens: null, error: null, messages: [], models: [], events: [] };
  const messages = new Map<string, DetailMessage>();
  const events = new Map<string, UsageEvent>();
  const pending = new Map<string, ToolEntry>();
  const seenTools = new Set<string>();
  const usageByMessage = new Map<string, { model: string; tokens: ModelUsageSummary["tokens"] }>();
  let customTitle = false;
  const truncated = statSync(path).size > maxBytes;
  // Metadata stays at the head even when the board tails a large journal.
  if (truncated) {
    for (const entry of entries(path, 64 * 1024, false)) {
      if (entry.isSidechain === true || entry.sessionId && entry.sessionId !== id) continue;
      if (!state.session.directory && typeof entry.cwd === "string") state.session.directory = scrub(entry.cwd);
      if (typeof entry.timestamp === "string" && !state.session.created_at) {
        const at = Date.parse(entry.timestamp); if (Number.isFinite(at) && at >= 0) state.session.created_at = at;
      }
      if (entry.type === "custom-title" && typeof entry.customTitle === "string") { state.session.title = scrub(entry.customTitle).slice(0, 90); customTitle = true; }
      const message = record(entry.message);
      if (entry.type === "user" && !entry.isMeta && !state.prompt) {
        const content = Array.isArray(message.content) ? message.content.map(record) : [];
        const text = typeof message.content === "string" ? message.content : content.filter(c => c.type === "text").map(c => string(c.text) ?? "").join("\n");
        if (text) { state.prompt = scrub(text).slice(0, 140); if (!customTitle) state.session.title = scrub(text).slice(0, 90); }
      }
    }
  }
  for (const entry of entries(path, maxBytes)) {
    if (entry.sessionId && entry.sessionId !== id || entry.isSidechain === true) continue;
    // Later cwd values follow Claude's shell, not the session's original project.
    if (!state.session.directory && typeof entry.cwd === "string") state.session.directory = scrub(entry.cwd);
    if (entry.type === "custom-title" && typeof entry.customTitle === "string") { state.session.title = scrub(entry.customTitle).slice(0, 90); customTitle = true; }
    const at = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : NaN;
    if (!Number.isFinite(at) || at < 0) continue;
    if (!state.session.created_at) state.session.created_at = at;
    state.session.updated_at = Math.max(state.session.updated_at, at);
    const message = record(entry.message);
    const content = Array.isArray(message.content) ? message.content.map(record) : [];
    const text = scrub(typeof message.content === "string" ? message.content : content.filter(c => c.type === "text").map(c => string(c.text) ?? "").join("\n")).slice(0, 32_000);
    const results = content.filter(c => c.type === "tool_result");
    if (entry.type === "user" && results.length) {
      for (const result of results) {
        const tool = pending.get(string(result.tool_use_id) ?? "");
        if (tool) { tool.ended = at; tool.duration_ms = tool.started === null ? null : Math.max(0, at - tool.started); tool.status = result.is_error ? "error" : "completed"; pending.delete(string(result.tool_use_id)!); }
      }
      state.column = [...pending.values()].some(t => t.tool === "AskUserQuestion") ? "attention" : "running";
      state.stage = state.column === "attention" ? "Waiting for input" : "Working";
      state.since = at; state.lastEventAt = at; continue;
    }
    if (entry.type === "user" && !entry.isMeta && text) {
      if (!state.prompt && !customTitle) state.session.title = text.slice(0, 90);
      state.prompt = text.slice(0, 140); state.startedAt = at; state.finishedAt = null; state.error = null;
      pending.clear(); state.column = "running"; state.stage = "Working"; state.since = at; state.lastEventAt = at;
      const key = string(entry.uuid) ?? `user:${at}`;
      events.set(`turn:${key}`, { id: `${state.session.id}:turn:${key}`, session_id: state.session.id, at, kind: "turn", agent: "Claude Code", model: state.model, tokens: null, cost: null, incomplete: false });
      messages.set(key, { role: "user", agent: null, created: at, started: at, completed: at, duration_ms: null, model: null, cost: null, usage: null, text, tools: [], error: null });
    } else if (entry.type === "assistant") {
      const key = string(message.id) ?? string(entry.uuid) ?? `assistant:${at}`;
      const previous = messages.get(key);
      const model = scrub(string(message.model));
      if (model && model !== "<synthetic>") state.model = `anthropic/${model}`;
      const usage = normalizeClaudeTokens(message.usage);
      if (usage) {
        const { other: _other, ...tokens } = usage.tokens;
        const usageModel = model && model !== "<synthetic>" ? `anthropic/${model}` : null;
        usageByMessage.set(key, { model: usageModel ?? "unknown", tokens });
        state.contextTokens = tokens.total;
        const explicitLimit = nonnegative(record(message.usage).context_window);
        if (explicitLimit) state.contextLimit = explicitLimit;
        events.set(key, { id: `${state.session.id}:usage:${key}`, session_id: state.session.id, at, kind: "usage", agent: "Claude Code", model: usageModel, tokens: usage.tokens, cost: nonnegative(message.costUSD), incomplete: usage.incomplete || usageModel === null });
      }
      const tools = previous?.tools ?? [];
      for (const block of content.filter(c => c.type === "tool_use")) {
        const toolId = string(block.id); if (!toolId || seenTools.has(toolId)) continue;
        seenTools.add(toolId);
        const tool: ToolEntry = { tool: scrub(string(block.name)), status: "running", started: at, ended: null, duration_ms: null, skill_name: null };
        pending.set(toolId, tool); tools.push(tool); state.lastTool = tool.tool;
      }
      const error = entry.isApiErrorMessage === true ? text || "Request failed" : null;
      const complete = message.stop_reason === "end_turn" || message.stop_reason === "stop_sequence";
      state.column = error ? "attention" : [...pending.values()].some(t => t.tool === "AskUserQuestion") ? "attention" : complete && !pending.size ? "idle" : "running";
      state.stage = error ? "Error" : state.column === "attention" ? "Waiting for input" : state.column === "idle" ? "Finished" : "Working";
      state.error = error; state.since = at; state.lastEventAt = at; state.finishedAt = state.column === "idle" ? at : null;
      messages.set(key, { role: "assistant", agent: "Claude Code", created: previous?.created ?? at, started: previous?.started ?? at, completed: complete ? at : null,
        duration_ms: complete && state.startedAt !== null ? Math.max(0, at - state.startedAt) : null, model: state.model,
        cost: nonnegative(message.costUSD), usage: usage ? { ...usage.tokens } : null, text: text || previous?.text || "", tools, error });
    } else if (entry.type === "system" && (entry.subtype === "turn_duration" || entry.subtype === "stop_hook_summary" && entry.preventedContinuation !== true)) {
      if (state.column !== "attention") { state.column = "idle"; state.stage = "Finished"; state.since = at; state.finishedAt = at; state.lastEventAt = at; }
    }
    while (messages.size > 100) messages.delete(messages.keys().next().value!);
  }
  const models = new Map<string, ModelUsageSummary>();
  for (const { model, tokens } of usageByMessage.values()) {
    const row = models.get(model) ?? { model, turns: 0, cost: null, tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, total: 0 } };
    row.turns++; for (const field of Object.keys(tokens) as Array<keyof typeof tokens>) row.tokens[field] += tokens[field];
    models.set(model, row);
  }
  state.models = [...models.values()]; state.events = [...events.values()]; state.messages = [...messages.values()].slice(-100);
  state.tokens = !truncated && usageByMessage.size ? state.models.reduce((sum, row) => sum + row.tokens.total, 0) : null;
  if (state.column === "running" && now - state.lastEventAt > STALE_STREAM_MS) { state.column = "idle"; state.stage = "Status unknown"; }
  return state;
}
