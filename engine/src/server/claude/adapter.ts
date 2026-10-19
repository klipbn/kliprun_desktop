import { basename } from "node:path";
import { statSync } from "node:fs";
import type { CardPayload, SessionDetailPayload } from "@shared/types";
import type { TerminalLink } from "../terminalLinks";
import { scrub } from "../security";
import { repositoryOf } from "../vcs";
import { contextUsage } from "../modelLimits";
import { STALE_STREAM_MS } from "@shared/constants";
import { canonicalPath } from "../codex/liveness";
import { CLAUDE_ID, claudeHome, claudeJournals, readClaudeJournal, type ClaudeJournal } from "./journal";
import type { ClaudeProcess } from "./liveness";

export class ClaudeAdapter {
  private processes: ClaudeProcess[] = [];
  private paths = new Map<string, string>();
  private cache = new Map<string, { identity: string; journal: ClaudeJournal }>();
  private current: CardPayload[] = [];
  private links: TerminalLink[] = [];
  diagnostics: string[] = [];
  constructor(private readonly home = claudeHome()) {}
  setProcesses(processes: ClaudeProcess[]): void { this.processes = processes; }
  terminalLinks(): TerminalLink[] { return this.links; }
  historyCards(): CardPayload[] { return this.current; }
  private discover(): void {
    this.paths = new Map(claudeJournals(this.home).map(path => [basename(path, ".jsonl"), path]));
  }
  private read(id: string, now: number): ClaudeJournal | null {
    if (!CLAUDE_ID.test(id)) return null;
    try {
      if (!this.paths.has(id)) this.discover();
      const path = this.paths.get(id); if (!path) return null;
      const stat = statSync(path), identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
      const cached = this.cache.get(id);
      if (cached?.identity === identity) return cached.journal.column === "running" && now - cached.journal.lastEventAt > STALE_STREAM_MS
        ? { ...cached.journal, column: "idle", stage: "Status unknown" } : cached.journal;
      const journal = readClaudeJournal(path, now); this.cache.set(id, { identity, journal }); return journal;
    } catch { return null; }
  }
  cards(now: number): CardPayload[] {
    this.links = []; this.current = []; this.diagnostics = [];
    const active = new Set(this.processes.map(p => p.sessionId));
    for (const id of this.cache.keys()) if (!active.has(id)) this.cache.delete(id);
    return this.processes.map(process => {
      const state = process.sessionId ? this.read(process.sessionId, now) : null;
      const confirmed = state && canonicalPath(state.session.directory) === canonicalPath(process.cwd) &&
        this.processes.filter(p => p.sessionId === process.sessionId).length === 1;
      const statusAt = process.statusUpdatedAt;
      const nativeStatus = confirmed && statusAt !== undefined && Number.isFinite(statusAt) && statusAt >= state.lastEventAt && statusAt <= now + 1000
        && ["busy", "waiting", "idle", "shell"].includes(process.status ?? "") ? process.status : null;
      const column = nativeStatus ? nativeStatus === "waiting" ? "attention" : nativeStatus === "busy" ? "running" : "idle" : confirmed ? state.column : "idle";
      const stage = nativeStatus ? column === "attention" ? "Waiting for input" : column === "running" ? "Working" : "Finished" : confirmed ? state.stage : "Status unknown";
      const card: CardPayload = { source: "claude", session_id: confirmed ? state.session.id : `claude-terminal:${process.pid}`,
        directory: scrub(process.cwd), directory_name: scrub(basename(process.cwd)), title: confirmed ? state.named ? state.session.title : scrub(process.name || state.session.title) : `Claude Code · ${scrub(basename(process.cwd))}`,
        prompt_snippet: confirmed ? state.prompt : null, parent_id: null, agent: { name: "Claude Code" },
        column, stage, stage_since: nativeStatus ? statusAt! : confirmed ? state.since : 0,
        running_since: confirmed && column === "running" ? state.startedAt ?? statusAt ?? null : null, last_event_at: nativeStatus ? statusAt! : confirmed ? state.lastEventAt : 0,
        reason: confirmed ? null : "Waiting for a confirmed session link from the Claude Code terminal.", error: confirmed ? state.error : null,
        last_tool: confirmed ? state.lastTool : null, message_count: confirmed ? state.messages.length : 0, finished_at: column === "idle" ? nativeStatus ? statusAt! : confirmed ? state.finishedAt : null : null,
        tokens_total: confirmed ? state.tokens : null, model_ref: confirmed ? state.model : null,
        context: confirmed ? state.contextLimit && state.contextTokens ? { model: state.model ?? "", used: state.contextTokens, limit: state.contextLimit, percent: Math.min(100, Math.round(state.contextTokens / state.contextLimit * 100)) } : contextUsage(state.model, state.contextTokens) : null,
        branch: confirmed ? scrub(repositoryOf(process.cwd).branch) : null, mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0, subagent_error_notes: [], children: [] };
      if (confirmed) { this.links.push({ session_id: card.session_id, pid: Number(process.pid) }); this.current.push(card); }
      else card.terminal = { pid: Number(process.pid), generation: process.startedAt ?? "", session_id: null, candidates: [] };
      return card;
    });
  }
  detail(sessionId: string, now: number): SessionDetailPayload {
    const state = sessionId.startsWith("claude:") ? this.read(sessionId.slice(7), now) : null;
    const repository = repositoryOf(state?.session.directory ?? "");
    return { source: "claude", session_id: sessionId, title: state?.session.title ?? "", directory: state?.session.directory ?? "", branch: scrub(repository.branch), repository_url: repository.url,
      mrs: [], messages: state?.messages ?? [], models: state?.models ?? [], kanban_history: [], exists: !!state };
  }
  watchPaths(): string[] { return [...this.processes.flatMap(p => p.sessionId && this.paths.has(p.sessionId) ? [this.paths.get(p.sessionId)!] : [])]; }
  close(): void { this.processes = []; this.paths.clear(); this.cache.clear(); this.current = []; this.links = []; }
}
