import { basename, join } from "node:path";
import type { CardPayload, SessionDetailPayload } from "@shared/types";
import { scrub } from "../security";
import { branchOf, repositoryOf } from "../vcs";
import { canonicalPath, identifiedCliSessions, matchCliSessions, type CliProcess } from "./liveness";
import { exactTerminalLinks, type TerminalLink } from "../terminalLinks";
import { RolloutReader, type RolloutState } from "./rollout";
import { codexHermesHome, readHermesStatuses, type HermesStatus } from "./hermes";
import { codexHome, CodexStorage, isTuiThread, type CodexThread } from "./storage";

export class CodexAdapter {
  private readonly storage: CodexStorage;
  private processes: CliProcess[] = [];
  private candidates: CodexThread[] = [];
  private readers = new Map<string, RolloutReader>();
  private threads = new Map<string, CodexThread>();
  private statuses = new Map<string, Pick<RolloutState, "column" | "since" | "turnId">>();
  private choices = new Map<string, string>();
  private observations = new Map<string, string | null>();
  private links: TerminalLink[] = [];
  private currentCards: CardPayload[] = [];
  diagnostics: string[] = [];

  constructor(home = codexHome(), private readonly hermesHome = codexHermesHome()) { this.storage = new CodexStorage(home); }

  setProcesses(processes: CliProcess[]): void {
    for (const previous of this.processes) {
      if (!processes.some(p => p.pid === previous.pid && p.startedAt === previous.startedAt && p.cwd === previous.cwd)) {
        this.choices.delete(previous.pid);
        this.observations.delete(previous.pid);
      }
    }
    this.processes = processes;
  }

  terminalLinks(): TerminalLink[] {
    return this.links;
  }

  terminals(): Array<{ pid: number; generation: string }> {
    return this.processes.map(p => ({ pid: Number(p.pid), generation: p.startedAt ?? "" }));
  }

  observeTerminalSession(pid: number, prefix: string | null, generation: string): boolean {
    const process = this.processes.find(p => Number(p.pid) === pid && p.startedAt === generation);
    if (!process) return false;
    try {
      const row = prefix === null ? null : this.storage.threadWithPrefix(prefix);
      // Never retain the previous chat while a new title is unresolved or ambiguous.
      this.observations.set(process.pid, row?.id ?? null);
      return prefix === null || row !== null;
    } catch {
      this.observations.set(process.pid, null);
      return false;
    }
  }

  private sessionCandidates(process: CliProcess): CodexThread[] {
    const rows = this.candidates.filter(row => isTuiThread(row) && canonicalPath(row.cwd) === canonicalPath(process.cwd));
    const loaded = rows.filter(row => process.daemonSessionIds?.includes(row.id) || row.id === this.choices.get(process.pid));
    return loaded.length ? loaded : rows;
  }

  selectTerminalSession(pid: number, sessionId: string | null, generation: string): boolean {
    const process = this.processes.find(p => Number(p.pid) === pid);
    if (!process || (process.startedAt ?? "") !== generation) return false;
    if (sessionId === null) { this.choices.delete(process.pid); return true; }
    const row = this.sessionCandidates(process).find(row => `codex:${row.id}` === sessionId);
    const direct = identifiedCliSessions(process, this.candidates);
    if (!row || (direct.length && (direct.length !== 1 || direct[0].id !== row.id)) ||
      this.links.some(link => link.session_id === sessionId && link.pid !== pid)) return false;
    this.choices.set(process.pid, row.id);
    return true;
  }

  cards(now: number): CardPayload[] {
    this.diagnostics = [];
    this.links = [];
    this.currentCards = [];
    if (!this.processes.length) { this.threads.clear(); this.readers.clear(); this.statuses.clear(); return []; }
    let processes: CliProcess[];
    let matched: CodexThread[];
    try {
      this.candidates = this.storage.candidates(this.processes.map(p => ({ ...p, selectedSessionId: this.choices.get(p.pid), activeSessionId: this.observations.get(p.pid) })));
      processes = this.processes.map(p => {
        const direct = identifiedCliSessions(p, this.candidates);
        if (direct.length === 1 && direct[0].id !== this.choices.get(p.pid)) this.choices.delete(p.pid);
        return { ...p, selectedSessionId: this.sessionCandidates(p).find(row => row.id === this.choices.get(p.pid))?.id,
          activeSessionId: this.observations.get(p.pid) };
      });
      const match = matchCliSessions(processes, this.candidates);
      this.diagnostics = match.diagnostics;
      matched = match.threads;
      this.links = exactTerminalLinks(new Map(), processes, this.candidates);
      for (const process of processes) {
        const rows = matched.filter(row => canonicalPath(row.cwd) === canonicalPath(process.cwd));
        if (process.activeSessionId === undefined && rows.length === 1 && processes.filter(p => canonicalPath(p.cwd) === canonicalPath(process.cwd)).length === 1 &&
          !this.links.some(link => link.session_id === `codex:${rows[0].id}` || link.pid === Number(process.pid))) {
          this.links.push({ session_id: `codex:${rows[0].id}`, pid: Number(process.pid) });
        }
      }
      const visible = new Set(this.links.map(link => link.session_id));
      const roots = this.candidates.filter(row => visible.has(`codex:${row.id}`));
      this.threads = new Map([...roots, ...this.storage.descendants(roots.map(row => row.id))].map(row => [row.id, row]));
    } catch {
      this.diagnostics = ["Codex database unavailable or incompatible; CLI sessions cannot be matched"];
      this.threads.clear();
      this.links = [];
      this.readers.clear(); this.statuses.clear();
      return this.processes.map(process => this.unresolvedCard(process));
    }
    for (const id of this.readers.keys()) if (!this.threads.has(id)) { this.readers.delete(id); this.statuses.delete(id); }
    const threads = [...this.threads.values()];
    const hermes = readHermesStatuses(this.hermesHome, threads, now);
    const cards = new Map(threads.map(row => [row.id, this.card(row, now, hermes.get(row.id))]));
    this.currentCards = [...cards.values()];
    for (const row of threads) {
      const child = cards.get(row.id)!;
      const parent = row.parent_thread_id ? cards.get(row.parent_thread_id) : undefined;
      if (!parent) continue;
      parent.subagent_count++;
      if (child.column !== "idle") parent.subagent_active++;
      if (child.stage === "Error") {
        parent.subagent_errors++;
        if (parent.subagent_error_notes.length < 3) parent.subagent_error_notes.push(`${child.title} — ${child.error ?? "failed"}`.slice(0, 160));
      }
      if (child.column !== "idle" && child.column === parent.column) parent.children.push(child);
    }
    const roots = processes.map(process => {
      const link = this.links.find(link => link.pid === Number(process.pid));
      const row = link ? this.threads.get(link.session_id.slice(6)) : undefined;
      const candidates = this.sessionCandidates(process).filter(row => !this.links.some(link => link.pid !== Number(process.pid) && link.session_id === `codex:${row.id}`));
      const terminal = { pid: Number(process.pid), generation: process.startedAt ?? "", session_id: row ? `codex:${row.id}` : null,
        candidates: candidates.map(row => ({ session_id: `codex:${row.id}`, title: scrub(row.title).slice(0, 90) })) };
      const card = row ? cards.get(row.id)! : this.unresolvedCard(process);
      if (!row || process.selectedSessionId) card.terminal = terminal;
      return card;
    });
    return [...roots, ...threads.filter(row => {
      const card = cards.get(row.id)!;
      const parent = row.parent_thread_id ? cards.get(row.parent_thread_id) : undefined;
      return parent && card.column !== "idle" && card.column !== parent.column;
    }).map(row => cards.get(row.id)!)];
  }

  historyCards(): CardPayload[] { return this.currentCards; }

  private unresolvedCard(process: CliProcess): CardPayload {
    return { source: "codex", session_id: `codex-terminal:${process.pid}`, directory: scrub(process.cwd),
      directory_name: scrub(basename(process.cwd)), title: `Codex · ${scrub(basename(process.cwd))}`, prompt_snippet: null,
      parent_id: null, agent: { name: "Codex" }, column: "idle", stage: "Status unknown", stage_since: 0,
      running_since: null, last_event_at: 0, reason: "Waiting for a confirmed session link from the Codex terminal.", error: null,
      last_tool: null, message_count: 0, finished_at: null, tokens_total: null, model_ref: null, context: null,
      branch: null, mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0, subagent_error_notes: [], children: [],
      terminal: { pid: Number(process.pid), generation: process.startedAt ?? "", session_id: null, candidates: [] } };
  }

  private card(row: CodexThread, now: number, hermes?: HermesStatus): CardPayload {
    let reader = this.readers.get(row.id);
    if (!reader) { reader = new RolloutReader(); this.readers.set(row.id, reader); }
    let state: RolloutState | undefined;
    try { state = reader.read(row.rollout_path, now, row.model); } catch {
      this.diagnostics.push(`Session ${row.id}: local journal unavailable`);
    }
    const previous = this.statuses.get(row.id);
    if (state && hermes && hermes.updatedAt >= state.lastEventAt &&
      (!state.turnId || !hermes.turnId || state.turnId === hermes.turnId) &&
      state.turnActive !== false &&
      (hermes.daemon || (state.turnId !== null && state.turnId === hermes.turnId))) {
      const column = hermes.status === "waiting" ? "attention" : "running";
      const since = column === "attention" ? hermes.waitingSince!
        : previous?.column === "running" && previous.turnId === state.turnId ? previous.since
        : state.column === "running" && previous?.column !== "attention" ? state.since : hermes.updatedAt;
      state = { ...state, column, stage: column === "attention" ? "Waiting for input" : "Working", since,
        finishedAt: null, reason: null };
    }
    if (state) this.statuses.set(row.id, { column: state.column, since: state.since, turnId: state.turnId });
    else this.statuses.delete(row.id);
    return {
      source: "codex", session_id: `codex:${row.id}`, directory: scrub(row.cwd), directory_name: scrub(basename(row.cwd)),
      title: scrub(row.title).slice(0, 90), prompt_snippet: state?.prompt ?? null,
      parent_id: row.parent_thread_id ? `codex:${row.parent_thread_id}` : null,
      agent: { name: typeof row.agent_nickname === "string" ? scrub(row.agent_nickname) : "Codex" },
      column: state?.column ?? "idle", stage: state?.stage ?? "Status unknown", stage_since: state?.since || row.updated_at * 1000,
      running_since: state?.column === "running" ? state.startedAt : null, last_event_at: state?.lastEventAt || row.updated_at * 1000,
      reason: state?.reason ?? (state ? null : "Local journal unavailable"), error: state?.stage === "Error" ? "Turn failed" : null,
      last_tool: state?.lastTool ?? null, message_count: state?.messages.length ?? 0, finished_at: state?.finishedAt ?? null,
      tokens_total: state?.tokens ?? null, model_ref: scrub(state?.model ?? row.model), context: state?.context ? { ...state.context, model: scrub(state.context.model) } : null,
      branch: scrub(branchOf(row.cwd)), mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0, subagent_error_notes: [], children: [],
    };
  }

  detail(sessionId: string, now: number): SessionDetailPayload {
    const id = sessionId.replace(/^codex:/, "");
    let row = this.threads.get(id);
    try { row ??= this.storage.thread(id) ?? undefined; } catch { /* storage unavailable */ }
    let messages: SessionDetailPayload["messages"] = [];
    let models: SessionDetailPayload["models"] = [];
    if (row) {
      try {
        const state = (this.readers.get(row.id) ?? new RolloutReader()).read(row.rollout_path, now);
        messages = state?.messages ?? [];
        models = state?.models ?? [];
      } catch { /* journal removed */ }
    }
    const repository = row ? repositoryOf(row.cwd) : { branch: null, url: null };
    return { source: "codex", session_id: sessionId, title: scrub(row?.title ?? ""), directory: scrub(row?.cwd ?? ""),
      branch: scrub(repository.branch), repository_url: repository.url, mrs: [], messages, models, kanban_history: [], exists: !!row };
  }

  watchPaths(): string[] {
    return [...(this.storage.path ? [this.storage.path, `${this.storage.path}-wal`] : []),
      ...[...this.threads.values()].map(row => row.rollout_path),
      ...(this.threads.size ? [join(this.hermesHome, "sessions")] : [])];
  }

  /** Current journal model, with only an explicitly persisted provider. */
  usageModel(card: CardPayload): string | null {
    if (!card.model_ref) return null;
    const provider = this.threads.get(card.session_id.replace(/^codex:/, ""))?.model_provider;
    return provider ? scrub(`${provider}/${card.model_ref}`) : card.model_ref;
  }

  close(): void { this.storage.close(); this.threads.clear(); this.readers.clear(); this.statuses.clear(); this.candidates = []; this.choices.clear(); this.observations.clear(); this.links = []; this.currentCards = []; }
}
