import { History, PanelLeftClose, PanelLeftOpen, SquareTerminal } from "lucide-react";
import type { UsageSession } from "@shared/usage";
import { formatRelativeTimeVerbose } from "@shared/format";

interface Props {
  sessions: UsageSession[];
  collapsed: boolean;
  selectedId: string | null;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onResume?: (id: string) => void;
}

export function RecentSessions({ sessions, collapsed, selectedId, pending, error, onToggle, onSelect, onResume }: Props) {
  return <aside aria-label="Recent sessions" className={`shrink-0 min-h-0 flex flex-col border-r border-border bg-surface ${collapsed ? "w-10" : "w-52 lg:w-60 max-w-[40vw]"}`}>
    <div className="flex items-center gap-2 p-2 border-b border-border">
      {!collapsed && <><History className="w-4 h-4 shrink-0 text-accent" /><h2 className="flex-1 text-xs font-semibold">Recent Sessions</h2></>}
      <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Show recent sessions" : "Hide recent sessions"}
        title={collapsed ? "Show recent sessions" : "Hide recent sessions"} className="p-1 rounded text-text-secondary hover:text-accent">
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>
    </div>
    {!collapsed && <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      {error && <p role="status" className="text-xs text-error p-2">{error}</p>}
      {!sessions.length && <p className="text-xs text-text-secondary p-2">{pending ? "Loading recent sessions…" : "No recent sessions yet."}</p>}
      {sessions.map(session => <div key={session.id} className={`rounded-md border ${selectedId === session.id ? "border-accent/50 bg-accent/10" : "border-transparent hover:bg-background"}`}>
        <button type="button" onClick={() => onSelect(session.id)} className="w-full text-left p-2" title={session.directory}>
          <span className="block text-xs font-medium text-white break-words line-clamp-2">{session.title || "Untitled session"}</span>
          <span className="block text-[10px] text-text-secondary mt-1 truncate">{session.source === "codex" ? "Codex" : "OpenCode"} · {session.directory.split("/").filter(Boolean).pop() || "/"}</span>
          <span className="block text-[10px] text-text-secondary mt-0.5">{formatRelativeTimeVerbose(session.updated_at)}</span>
        </button>
        {onResume && <button type="button" onClick={() => onResume(session.id)} title={`Resume in ${session.source === "codex" ? "Codex" : "OpenCode"}`}
          aria-label={`Resume in ${session.source === "codex" ? "Codex" : "OpenCode"}: ${session.title}`}
          className="flex items-center gap-1.5 mx-2 mb-2 px-1.5 py-1 rounded border border-border text-[10px] text-text-secondary hover:text-accent hover:border-accent/40">
          <SquareTerminal className="w-3 h-3" />Resume in Terminal
        </button>}
      </div>)}
    </div>}
  </aside>;
}
