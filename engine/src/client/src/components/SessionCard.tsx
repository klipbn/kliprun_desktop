import { memo } from "react";
import {
  Bot,
  CircleAlert,
  CircleHelp,
  Folder,
  Flag,
  GitBranch,
  GitMerge,
  Loader2,
  Mail,
  MailOpen,
  SquareTerminal,
  Zap,
} from "lucide-react";
import type { CardPayload } from "@shared/types";
import type { TrackedCard } from "@shared/readTracker";
import { formatDuration, formatRelativeTimeVerbose, formatTokens } from "@shared/format";
import type { CardPriorities, CardPriority } from "../cardPriorities";

const PRIORITY_STYLES: Record<CardPriority, string> = {
  critical: "text-error",
  medium: "text-warning",
  low: "text-success",
};

function StatusIcon({ card, read }: { card: CardPayload; read: boolean }) {
  if (card.source === "codex" && card.stage === "Status unknown") {
    return <CircleHelp className="w-4 h-4 text-text-secondary shrink-0" aria-label="Status unknown" />;
  }
  if (card.column === "attention") {
    return (
      <CircleAlert className="w-4 h-4 text-warning shrink-0" data-testid="card-icon-attention" aria-label="Needs attention" />
    );
  }
  if (card.column === "running") {
    return <Loader2 className="w-4 h-4 text-accent shrink-0 animate-spin" data-testid="card-icon-running" aria-label="Thinking" />;
  }
  if (read) {
    return <MailOpen className="w-4 h-4 text-text-secondary shrink-0" data-testid="card-icon-read" aria-label="Opened" />;
  }
  return <Mail className="w-4 h-4 text-warning shrink-0" data-testid="card-icon-unread" aria-label="Idle" />;
}

function borderClass(card: CardPayload): string {
  if (card.source === "codex" && card.column === "idle" && !card.finished_at && !card.error) return "border-l-border";
  switch (card.column) {
    case "attention":
      return "border-l-warning animate-attention";
    case "running":
      return "border-l-accent";
    default:
      return card.error ? "border-l-error" : "border-l-success";
  }
}

function barColor(percent: number): string {
  if (percent >= 90) return "bg-error";
  if (percent >= 70) return "bg-warning";
  return "bg-accent";
}

interface Props {
  card: CardPayload;
  depth: number;
  selectedId: string | null;
  activeTerminalId: string | null;
  now: number;
  isRead: (card: TrackedCard) => boolean;
  priorities: CardPriorities;
  onPriorityChange: (id: string, priority: CardPriority | null) => void;
  onSelect: (id: string) => void;
}

export const SessionCard = memo(function SessionCard({ card, depth, selectedId, activeTerminalId, now, isRead, priorities, onPriorityChange, onSelect }: Props) {
  const selected = card.session_id === selectedId;
  const activeTerminal = card.session_id === activeTerminalId;
  const read = card.column === "idle" && isRead(card);
  const priority = priorities[card.session_id];
  const isAttention = card.column === "attention";
  const isRunning = card.column === "running";

  const actionLine = isAttention
    ? "⚡ Needs your input"
    : card.stage || "No active task";

  const durationMs = isRunning
    ? card.running_since !== null
      ? Math.max(0, now - card.running_since)
      : null
    : isAttention
      ? card.stage_since
        ? Math.max(0, now - card.stage_since)
        : null
      : null;

  const context = card.context;

  return (
    <article
      data-testid={`card-${card.session_id}`}
      onClick={(event) => { event.stopPropagation(); onSelect(card.session_id); }}
      className={`w-full text-left rounded-md border border-border border-l-2 ${borderClass(card)} ${
        activeTerminal ? "bg-accent/10 ring-2 ring-accent shadow-[0_0_18px_rgba(88,166,255,0.28)]" :
        selected ? "bg-background ring-2 ring-accent/70" : "bg-surface hover:bg-background"
      } transition-colors p-2.5 flex flex-col gap-1 animate-fade-in cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent ${
        depth > 0 ? "border-dashed" : ""
      }`}
    >
      <div className="flex items-center gap-2 w-full min-w-0">
        <StatusIcon card={card} read={read} />
        <h3
          className="text-sm font-medium truncate flex-1 min-w-0 text-white"
          title={card.title}
        >
          <button type="button" className="w-full truncate text-left outline-none focus-visible:underline">
            {card.title || "Untitled Session"}
          </button>
        </h3>
        {activeTerminal && <span className="inline-flex items-center gap-1 rounded border border-accent/60 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent shrink-0" data-testid="active-terminal-badge"><SquareTerminal className="w-3 h-3" />Terminal</span>}
        <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-border/50 focus-within:ring-1 focus-within:ring-accent ${priority ? PRIORITY_STYLES[priority] : "text-text-secondary/60 hover:text-text-primary"}`} title={`Priority: ${priority ? priority[0].toUpperCase() + priority.slice(1) : "Not set"}. Click to change.`}>
          <Flag className="h-3.5 w-3.5" fill={priority ? "currentColor" : "none"} aria-hidden="true" />
          <select
            aria-label={`Priority for ${card.title || "Untitled Session"}`}
            data-testid="card-priority"
            value={priority ?? ""}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onPriorityChange(card.session_id, (event.target.value || null) as CardPriority | null)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            <option value="">No priority</option>
            <option value="critical">Critical</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </span>
        <span className="text-xs text-text-secondary shrink-0">
          {formatRelativeTimeVerbose(card.last_event_at || null)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-6 w-full min-w-0 text-xs">
        <span className="px-1.5 py-0.5 rounded text-[10px] border border-border text-text-secondary shrink-0" data-testid="card-source">
          {card.source === "codex" ? "Codex CLI" : "OpenCode"}
        </span>
        <span
          className={`truncate flex-1 min-w-0 ${
            isAttention ? "text-warning font-medium" : "text-text-secondary"
          }`}
          title={card.reason ?? card.stage}
          data-testid="card-action"
        >
          {actionLine}
        </span>
        {card.agent && card.source !== "codex" && (
          <span className="max-w-full truncate px-1.5 py-0.5 rounded text-[10px] bg-surface border border-border text-text-secondary shrink-0">
            {card.agent.name}
          </span>
        )}
        {card.mrs.slice(0, 3).map((mr) => (
          <a
            key={mr.url}
            href={mr.url}
            target="_blank"
            rel="noreferrer"
            title={mr.url}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center gap-0.5 min-w-0 max-w-full px-1.5 py-0.5 rounded text-[10px] bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20"
            data-testid="card-mr"
          >
            <GitMerge className="w-3 h-3 shrink-0" />
            <span className="truncate">{mr.label}</span>
          </a>
        ))}
      </div>

      {(durationMs !== null || (!context && card.tokens_total !== null) || card.branch || card.subagent_count > 0) && (
        <div className="flex flex-wrap items-center gap-3 pl-6 text-[11px] text-text-secondary min-w-0">
          {durationMs !== null && <span data-testid="card-duration">{formatDuration(durationMs)}</span>}
          {!context && card.tokens_total !== null && (
            <span title={`Context tokens (${card.model_ref ?? "unknown model"})`}>
              {formatTokens(card.tokens_total)} tok
            </span>
          )}
          {card.branch && (
            <span className="flex items-center gap-0.5 min-w-0 max-w-full" title={`git branch: ${card.branch}`}>
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{card.branch}</span>
            </span>
          )}
          {card.subagent_count > 0 && (
            <span
              className={`flex items-center gap-0.5 shrink-0 ${
                card.subagent_active > 0 ? "text-accent" : ""
              }`}
              title={
                card.subagent_active > 0
                  ? `Subagents: ${card.subagent_active} working of ${card.subagent_count}`
                  : `Subagents: ${card.subagent_count} finished`
              }
              data-testid="card-subagents"
            >
              <Bot className="w-3 h-3" />
              {card.subagent_active > 0
                ? `${card.subagent_active}/${card.subagent_count}`
                : card.subagent_count}
            </span>
          )}
          {card.subagent_errors > 0 && (
            <span
              className="flex items-center gap-0.5 shrink-0 text-error"
              title={[
                `Subagents: ${card.subagent_errors} of ${card.subagent_count} failed`,
                ...card.subagent_error_notes,
              ].join("\n")}
              data-testid="card-subagent-errors"
            >
              <CircleAlert className="w-3 h-3" />
              {card.subagent_errors}
            </span>
          )}
          <span className="flex items-center gap-0.5 min-w-0 truncate" title={card.directory}>
            <Folder className="w-3 h-3 shrink-0" />
            <span className="truncate">{card.directory_name}</span>
          </span>
        </div>
      )}

      {context && (
        <div className="pl-6 flex flex-col gap-1" data-testid="card-context" title={`${context.model}: ${formatTokens(context.used)} of ${formatTokens(context.limit)} context tokens`}>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(context.percent)}`}
              style={{ width: `${Math.max(2, context.percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-secondary gap-2">
            <span className="truncate">
              <span className="text-white">{context.model}</span>
              <span className="mx-1">·</span>
              {Math.round(context.percent)}% context
            </span>
            <span className="shrink-0">
              {formatTokens(context.used)} / {formatTokens(context.limit)}
            </span>
          </div>
        </div>
      )}

      {typeof card.error === "string" && card.error.length > 0 && (
        <div
          className="pl-6 text-[11px] text-error truncate"
          title={card.reason ?? undefined}
          data-testid="card-error"
        >
          <Zap className="w-3 h-3 inline mr-0.5" />
          {card.error}
        </div>
      )}

      {card.children.length > 0 && (
        <div className="pl-3 border-l border-border space-y-1.5 mt-1">
          {card.children.map((child) => (
            <SessionCard
              key={child.session_id}
              card={child}
              depth={depth + 1}
              selectedId={selectedId}
              activeTerminalId={activeTerminalId}
              now={now}
              isRead={isRead}
              priorities={priorities}
              onPriorityChange={onPriorityChange}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </article>
  );
});
