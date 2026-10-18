import { Folder, Loader2, Mail, SquareTerminal } from "lucide-react";
import type { AgentSummary, CardPayload } from "@shared/types";
import type { ReactNode } from "react";
import type { TrackedCard } from "@shared/readTracker";
import { StatusSessions } from "./StatusSessions";

export function statusSessions<T extends TrackedCard>(cards: T[], isRead: (card: T) => boolean) {
  const resolved = cards.filter(card => card.terminal?.session_id !== null);
  return { running: resolved.filter(card => card.column === "running"), unread: resolved.filter(card => card.column === "idle" && !isRead(card)) };
}

interface Props {
  sessionCount: number;
  projectCount: number;
  running: number;
  agentsRunning: number;
  subagentsRunning: number;
  unread: number;
  agents: AgentSummary[];
  cards: CardPayload[];
  isRead: (card: TrackedCard) => boolean;
  onSelect: (id: string) => void;
  usage?: ReactNode;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${Math.abs(count) === 1 ? "" : "s"}`;
}

/** Bottom application status bar. */
export function StatusBar({ sessionCount, projectCount, running, agentsRunning, subagentsRunning, unread, agents, cards, isRead, onSelect, usage }: Props) {
  const lists = statusSessions(cards, isRead);
  return (
    <footer
      className="status-bar shrink-0 flex items-center gap-3 px-4 py-1.5 border-t border-border bg-surface text-xs"
      aria-label="Application status"
    >
      <div className="status-bar-counts flex items-center gap-3 min-w-0">
        <span className="flex items-center gap-1.5 text-text-primary" data-testid="session-count">
          <SquareTerminal className="w-3.5 h-3.5 text-accent" />
          {plural(sessionCount, "session")}
        </span>
        <span className="flex items-center gap-1.5 text-text-primary" data-testid="project-count">
          <Folder className="w-3.5 h-3.5 text-accent" />
          {plural(projectCount, "project")}
        </span>
      </div>

      <div className="status-bar-activity flex-1 flex items-center justify-center gap-3 min-w-0">
        <StatusSessions label="Running sessions" cards={lists.running} onSelect={onSelect}>
        <span
          className="flex items-center gap-1.5 text-text-primary"
          title="Running agents and subagents"
          aria-label={`Running: ${running}`}
          data-testid="running-count"
        >
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
          {plural(agentsRunning, "agent")}
          {subagentsRunning > 0 && (
            <span className="text-text-secondary" data-testid="subagent-count">
              · {plural(subagentsRunning, "subagent")}
            </span>
          )}
        </span>
        </StatusSessions>
        <StatusSessions label="Unread sessions" cards={lists.unread} onSelect={onSelect}>
        <span
          className={`flex items-center gap-1.5 ${unread > 0 ? "text-warning" : "text-text-secondary"}`}
          title="Unread IDLE cards"
          aria-label={`Unread: ${unread}`}
          data-testid="unread-count"
        >
          <Mail className="w-3.5 h-3.5" />
          {unread}
        </span>
        </StatusSessions>
        {agents.length > 0 && (
          <span className="flex items-center gap-1.5 min-w-0 overflow-hidden" aria-label="Agents">
            {agents.map((agent) => (
              <StatusSessions label={`${agent.name} sessions`} cards={cards.filter(card => card.agent?.name === agent.name && card.terminal?.session_id !== null)} onSelect={onSelect} key={agent.name}>
              <span
                key={agent.name}
                className={`px-2 py-0.5 rounded-full border shrink-0 ${
                  agent.working
                    ? "bg-accent/10 text-accent border-accent/40"
                    : "bg-surface text-text-secondary border-border"
                }`}
              >
                {agent.name}
              </span>
              </StatusSessions>
            ))}
          </span>
        )}
      </div>

      {usage}

      <span className="text-text-secondary shrink-0" title="Application version" data-testid="version">
        v{__APP_VERSION__}
      </span>
    </footer>
  );
}
