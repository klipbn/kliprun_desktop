import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  GitBranch,
  GitMerge,
  History,
  Loader2,
  MessageSquare,
  Terminal,
  User,
  Wrench,
  X,
} from "lucide-react";
import type { ColumnKey, DetailMessage, SessionDetailPayload } from "@shared/types";
import { COLUMNS } from "@shared/types";
import { hasDesktopBridge, type DesktopPreferences } from "../nativeBridge";
import { resizedDetailsWidth } from "./detailsSizing";
import { HarnessIcon } from "./HarnessIcon";
import { useDesktopPreferences } from "../hooks/useDesktopPreferences";
import { formatDuration, formatRelativeTimeVerbose, formatTokens } from "@shared/format";

const AGENT_MESSAGE_LIMIT = 42;

type TabKey = DesktopPreferences["detailTab"];

const TABS: { key: TabKey; label: string; icon: typeof MessageSquare }[] = [
  { key: "user", label: "User", icon: User },
  { key: "agent-text", label: "Agents T", icon: MessageSquare },
  { key: "agent", label: "Agent", icon: Terminal },
  { key: "models", label: "Models", icon: Cpu },
  { key: "kanban", label: "Kanban", icon: History },
];

export function AgentTextView({ messages }: { messages: DetailMessage[] }) {
  const replies = messages.filter((message) => message.role === "assistant" && message.text.trim());
  if (!replies.length) return <p className="text-sm text-text-secondary p-4">No agent text yet.</p>;
  return <div className="space-y-3 min-w-0">
    {replies.map((message, index) => {
      const timestamp = message.completed ?? message.created;
      const date = timestamp !== null && Number.isFinite(timestamp) ? new Date(timestamp) : null;
      const exactTime = date?.toLocaleString();
      return <article key={index} className="agent-markdown rounded-md border border-border bg-surface/60 p-3 text-sm text-text-primary"
        data-testid="agent-text-message">
        {date && <time dateTime={date.toISOString()} title={exactTime}
          className="block text-[11px] text-text-secondary">
          {Date.now() - date.getTime() < 12 * 60 * 60 * 1000 ? formatRelativeTimeVerbose(timestamp) : exactTime}
        </time>}
        <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          img: ({ alt }) => <span>{alt}</span>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}>{message.text}</Markdown>
      </article>;
    })}
  </div>;
}

const COLUMN_BADGE: Record<string, string> = {
  attention: "bg-warning/15 text-warning",
  running: "bg-accent/10 text-accent",
  idle: "bg-success/15 text-success",
};

function MessageView({ message }: { message: DetailMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`rounded-md border p-2.5 space-y-1.5 ${
        message.error ? "border-error/40 bg-error/5" : isUser ? "border-border bg-surface" : "border-border bg-surface/60"
      }`}
      data-testid="detail-message"
    >
      <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
        {isUser ? (
          <User className="w-3.5 h-3.5 text-accent" />
        ) : (
          <Terminal className="w-3.5 h-3.5 text-accent" />
        )}
        <span className="text-text-primary font-medium">{message.agent ?? message.role}</span>
        {message.model && <span className="px-1.5 rounded bg-background border border-border text-white">{message.model}</span>}
        {message.created !== null && <span>{formatRelativeTimeVerbose(message.created)}</span>}
        {message.duration_ms !== null && (
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {formatDuration(message.duration_ms)}
          </span>
        )}
        {message.cost !== null && message.cost > 0 && (
          <span className="flex items-center gap-0.5">
            <Coins className="w-3 h-3" />
            {message.cost < 0.01 ? message.cost.toExponential(1) : message.cost.toFixed(3)}
          </span>
        )}
        {message.usage && typeof message.usage === "object" && "total" in message.usage && (
          <span>{formatTokens(Number((message.usage as { total?: number }).total) || null)} tok</span>
        )}
      </div>
      {message.text && (
        <p className="text-sm whitespace-pre-wrap break-words text-text-primary max-h-64 overflow-y-auto">
          {message.text}
        </p>
      )}
      {message.tools.length > 0 && (
        <div className="space-y-1">
          {message.tools.map((tool, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-text-secondary">
              <Wrench className="w-3 h-3 shrink-0" />
              <span className="text-text-primary">{tool.skill_name ?? tool.tool ?? "tool"}</span>
              {tool.status === "running" ? (
                <Loader2 className="w-3 h-3 text-accent animate-spin" />
              ) : tool.status === "error" || tool.status === "failed" ? (
                <AlertCircle className="w-3 h-3 text-error" />
              ) : (
                <span className="text-success">{tool.status}</span>
              )}
              {tool.duration_ms !== null && <span>{formatDuration(tool.duration_ms)}</span>}
            </div>
          ))}
        </div>
      )}
      {message.error && (
        <p className="text-xs text-error whitespace-pre-wrap break-words">{message.error}</p>
      )}
    </div>
  );
}

function KanbanHistory({ detail }: { detail: SessionDetailPayload }) {
  const totals = useMemo<Partial<Record<ColumnKey, number>>>(() => {
    const acc: Partial<Record<ColumnKey, number>> = {};
    for (const interval of detail.kanban_history) {
      acc[interval.column as ColumnKey] = (acc[interval.column as ColumnKey] ?? 0) + interval.duration_ms;
    }
    return acc;
  }, [detail.kanban_history]);
  const totalsShown = COLUMNS.filter((column) => (totals[column] ?? 0) > 0);
  const intervals = [...detail.kanban_history].reverse();
  if (intervals.length === 0) {
    return <p className="text-sm text-text-secondary p-4">No recorded transitions yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {totalsShown.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pb-1" data-testid="kanban-status-totals">
          {totalsShown.map((column) => (
            <div key={column} className="rounded-md border border-border bg-surface p-2 space-y-1 text-xs">
              <span className={`inline-block px-2 py-0.5 rounded-full ${COLUMN_BADGE[column] ?? "bg-surface"}`}>
                {column}
              </span>
              <div className="text-text-primary font-medium">{formatDuration(totals[column] ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
      {intervals.map((interval, index) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded-md border border-border bg-surface p-2 text-xs"
        >
          <span className={`px-2 py-0.5 rounded-full ${COLUMN_BADGE[interval.column] ?? "bg-surface"}`}>
            {interval.column}
          </span>
          <span className="text-text-secondary">{formatRelativeTimeVerbose(interval.entered_at)}</span>
          <span className="flex-1" />
          <span className="text-text-primary font-medium">{formatDuration(interval.duration_ms)}</span>
          {interval.current && <span className="text-accent">current</span>}
        </div>
      ))}
    </div>
  );
}

function ModelsView({ detail }: { detail: SessionDetailPayload }) {
  if (detail.models.length === 0) {
    return <p className="text-sm text-text-secondary p-4">No model usage recorded.</p>;
  }
  return (
    <div className="space-y-2">
      {detail.models.map((model) => (
        <div key={model.model} className="rounded-md border border-border bg-surface p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-white">{model.model}</span>
            <span className="text-xs text-text-secondary">{model.turns} turns</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-text-secondary">Input</div>
              <div className="text-text-primary">{formatTokens(model.tokens.input)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Output</div>
              <div className="text-text-primary">{formatTokens(model.tokens.output)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Reasoning</div>
              <div className="text-text-primary">{formatTokens(model.tokens.reasoning)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Cache read</div>
              <div className="text-text-primary">{formatTokens(model.tokens.cache_read)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Cache write</div>
              <div className="text-text-primary">{formatTokens(model.tokens.cache_write)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Cost</div>
              <div className="text-text-primary">
                {model.cost === null ? "—" : model.cost < 0.01 && model.cost > 0 ? model.cost.toExponential(1) : model.cost.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function DetailsPanel({ sessionId, onClose }: Props) {
  const preferences = useDesktopPreferences();
  const [detail, setDetail] = useState<SessionDetailPayload | null>(null);
  const [tab, setTab] = useState<TabKey>(preferences.detailTab);
  useEffect(() => setTab(preferences.detailTab), [sessionId, preferences.detailTab]);
  const [error, setError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem("kliprun.detailsWidth"));
      return saved >= 320 && saved <= 850 ? saved : 420;
    } catch { return 420; }
  });
  const drag = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!hasDesktopBridge()) return;
    try { window.localStorage.setItem("kliprun.detailsWidth", String(panelWidth)); } catch { /* storage unavailable */ }
  }, [panelWidth]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/session/${sessionId}`);
        if (!response.ok) throw new Error(`session fetch failed: ${response.status}`);
        const payload = (await response.json()) as SessionDetailPayload;
        if (!cancelled) {
          setDetail(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "unknown error");
      }
    };
    setDetail(null);
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const filtered = useMemo<DetailMessage[]>(() => {
    if (!detail) return [];
    const agent = detail.messages.filter((m) => m.role !== "user");
    const user = detail.messages.filter((m) => m.role === "user");
    switch (tab) {
      case "agent":
        return agent.slice(0, AGENT_MESSAGE_LIMIT);
      case "user":
        return user;
      default:
        return [];
    }
  }, [detail, tab]);

  return (
    <aside
      className="fixed inset-0 z-50 w-full md:relative md:inset-auto md:z-auto md:w-[420px] shrink-0 border-l border-border bg-surface md:bg-surface/50 flex flex-col min-h-0"
      data-testid="details-panel"
      style={hasDesktopBridge() ? { width: panelWidth, minWidth: panelWidth, maxWidth: "calc(100vw - 340px)" } : undefined}
    >
      {hasDesktopBridge() && <div role="separator" aria-orientation="vertical" aria-label="Resize details panel" tabIndex={0}
        data-testid="detail-resize-handle"
        className="hidden md:block absolute -left-1 top-0 bottom-0 w-2 z-20 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/30"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, width: panelWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPanelWidth(resizedDetailsWidth(drag.current.width, drag.current.x, event.clientX, window.innerWidth));
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setPanelWidth(resizedDetailsWidth(panelWidth, 0, event.key === "ArrowLeft" ? -20 : 20, window.innerWidth));
        }} />}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <ChevronRight className="w-4 h-4 text-accent shrink-0" />
        <h2 className="text-sm font-medium truncate flex-1 text-white" title={detail?.title ?? sessionId}>
          {detail?.title ?? sessionId}
        </h2>
        {detail && <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary shrink-0">
          <HarnessIcon source={detail.source} />{detail.source === "codex" ? "Codex CLI" : "OpenCode"}
        </span>}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-background text-white"
          aria-label="Close details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {detail && detail.directory && (
        <div className="shrink-0 px-3 py-1.5 text-xs text-text-secondary border-b border-border flex items-center gap-2 min-w-0">
          <span className="truncate flex-1 min-w-0" title={detail.directory}>
            {detail.directory}
          </span>
          {(detail.branch || detail.repository_url) && (detail.repository_url ? (
            <a href={detail.repository_url} target="_blank" rel="noreferrer" title={detail.branch ? `Open branch ${detail.branch} in browser` : "Open repository in browser"}
              className="flex items-center gap-0.5 text-accent min-w-0 max-w-[50%] hover:underline" data-testid="repository-link">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{detail.branch ?? "Repository"}</span>
            </a>
          ) : (
            <span className="flex items-center gap-0.5 text-accent min-w-0 max-w-[50%]" title={`git branch: ${detail.branch}`}>
              <GitBranch className="w-3 h-3 shrink-0" /><span className="truncate">{detail.branch}</span>
            </span>
          ))}
        </div>
      )}
      {detail?.exists && detail.mrs.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-1.5 flex-wrap" data-testid="detail-mrs">
          <span className="text-xs text-text-secondary shrink-0">Merge requests:</span>
          {detail.mrs.map((mr) => (
            <a
              key={mr.url}
              href={mr.url}
              target="_blank"
              rel="noreferrer"
              title={mr.url}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20"
            >
              <GitMerge className="w-3 h-3" />
              {mr.label}
            </a>
          ))}
        </div>
      )}
      <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              tab === key ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-background"
            }`}
            aria-pressed={tab === key}
            data-testid={`tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {error && <p className="text-sm text-error">{error}</p>}
        {!detail && !error && <p className="text-sm text-text-secondary p-4">Loading…</p>}
        {detail && !detail.exists && (
          <p className="text-sm text-text-secondary p-4">Session not found in the database.</p>
        )}
        {detail?.exists && (tab === "agent" || tab === "user") &&
          (filtered.length === 0 ? (
            <p className="text-sm text-text-secondary p-4">No messages in this tab.</p>
          ) : (
            filtered.map((message, index) => <MessageView key={index} message={message} />)
          ))}
        {detail?.exists && tab === "models" && <ModelsView detail={detail} />}
        {detail?.exists && tab === "agent-text" && <AgentTextView messages={detail.messages} />}
        {detail?.exists && tab === "kanban" && <>
          <p className="text-xs text-text-secondary">Status history and time spent in each state.</p>
          <KanbanHistory detail={detail} />
        </>}
      </div>
    </aside>
  );
}

export type { ColumnKey };
