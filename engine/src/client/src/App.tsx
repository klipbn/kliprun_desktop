import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Building2, Plus, Settings2, SquareTerminal } from "lucide-react";
import type { CardPayload, ColumnKey } from "@shared/types";
import type { TrackedCard } from "@shared/readTracker";
import { sessionCards } from "@shared/readTracker";
import { linkedSessionId } from "@shared/sessionLink";
import { hasDesktopBridge, notifyNativeAction, notifyNativeSelection, notifyNativeResume, observeNativeNavigation, observeNativeTerminalSelection, recentSessionsCollapsed, setRecentSessionsCollapsed } from "./nativeBridge";
import { useBoard, useNow } from "./hooks/useBoard";
import { useReadTracker } from "./hooks/useReadTracker";
import { BoardColumn } from "./components/BoardColumn";
import { DetailsPanel } from "./components/DetailsPanel";
import { StatusBar } from "./components/StatusBar";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { RecentSessions } from "./components/RecentSessions";
import { useStatsRequest } from "./statistics/useStatsRequest";
import type { UsageSession } from "@shared/usage";
import { formatRelativeTimeVerbose } from "@shared/format";

const Statistics = lazy(() => import("./statistics/Statistics"));
const Office = lazy(() => import("./office/Office"));

function currentPage() {
  return window.location.pathname === "/stats" ? "stats" : window.location.pathname === "/office" ? "office" : "board";
}

function ConnectionIndicator(state: "connecting" | "live" | "polling", error: string | null) {
  let dot = "bg-warning animate-pulse";
  let text = "Connecting…";
  if (error && state !== "live") {
    dot = "bg-error";
    text = "Offline";
  } else if (state === "live") {
    dot = "bg-success shadow-[0_0_8px_#3fb95099]";
    text = "Connected";
  } else if (state === "polling") {
    dot = "bg-success";
    text = "Connected (polling)";
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-secondary" data-testid="connection">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </div>
  );
}

export default function App() {
  const { board, connection, error } = useBoard();
  const desktop = hasDesktopBridge();
  const [historyCollapsed, setHistoryCollapsed] = useState(recentSessionsCollapsed);
  const recent = useStatsRequest<{ sessions: UsageSession[] }>("/api/recent-sessions", 0);
  const now = useNow();
  const { isRead, counts, markRead } = useReadTracker(board);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [linkedId, setLinkedId] = useState(() => linkedSessionId(window.location.search));
  const [page, setPage] = useState(currentPage);
  const showStatistics = page === "stats";
  const statisticsSearch = useRef(showStatistics ? window.location.search : "");
  const activeSessionIds = useMemo(() => new Set(board ? sessionCards([
    ...board.columns.attention.cards,
    ...board.columns.running.cards,
    ...board.columns.idle.cards,
  ]).map((card) => card.session_id) : []), [board]);

  useEffect(() => {
    return observeNativeTerminalSelection(setActiveTerminalId);
  }, []);
  useEffect(() => {
    const navigate = () => {
      setPage(currentPage());
      setLinkedId(linkedSessionId(window.location.search));
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    if (!board || !linkedId) return;
    const card = findCard(board, linkedId);
    if (card) markRead(card);
    setSelectedId(linkedId);
    setLinkedId(null);
  }, [board, linkedId, markRead]);
  const openStatistics = useCallback(() => {
    window.history.pushState(null, "", `/stats${statisticsSearch.current}`);
    setPage("stats");
  }, []);
  const backToBoard = useCallback(() => {
    if (window.location.pathname === "/stats") statisticsSearch.current = window.location.search;
    window.history.pushState(null, "", "/");
    setPage("board");
  }, []);
  const openOffice = useCallback(() => {
    if (window.location.pathname === "/stats") statisticsSearch.current = window.location.search;
    window.history.pushState(null, "", "/office");
    setPage("office");
  }, []);
  useEffect(() => observeNativeNavigation(path => {
    if (path === "/") backToBoard();
    else if (path === "/stats") openStatistics();
    else if (path === "/office") openOffice();
  }), [backToBoard, openStatistics, openOffice]);
  const rememberStatisticsSearch = useCallback((search: string) => {
    statisticsSearch.current = search;
  }, []);
  const openBoardSession = useCallback((id: string) => {
    if (!activeSessionIds.has(id)) return;
    const card = board ? findCard(board, id) : null;
    if (card) markRead(card);
    notifyNativeSelection(id);
    setSelectedId(id);
    backToBoard();
  }, [activeSessionIds, backToBoard, board, markRead]);

  const select = useCallback(
    (id: string) => {
      // A new idle completion needs marking even when its details are already selected.
      const card = board ? findCard(board, id) : null;
      if (card?.column === "idle") markRead(card);
      notifyNativeSelection(id);
      setSelectedId(id);
    },
    [board, markRead],
  );

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    notifyNativeSelection(null);
  }, []);

  const loading = board === null;

  return (
    <div className="h-screen flex flex-col bg-background text-text-primary">
      <header className="relative shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <img src="/kliprun-icon.png" alt="" className="w-6 h-6" />
          <h1 className="font-semibold text-lg">KlipRun</h1>
        </div>
        {desktop && <div className="order-last w-full flex justify-center items-center gap-1.5 xl:order-none xl:w-auto xl:absolute xl:left-1/2 xl:top-1/2 xl:-translate-x-1/2 xl:-translate-y-1/2" aria-label="Agent terminals">
          <button type="button" onClick={() => notifyNativeAction("new-opencode")} data-testid="new-opencode-button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
            <Plus className="w-3.5 h-3.5" />New OpenCode
          </button>
          <button type="button" onClick={() => notifyNativeAction("new-codex")} data-testid="new-codex-button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
            <Plus className="w-3.5 h-3.5" />New Codex
          </button>
          <button type="button" onClick={() => notifyNativeAction("show-terminal")} data-testid="show-terminal-button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
            <SquareTerminal className="w-3.5 h-3.5" />Terminal
          </button>
        </div>}
        <div className="flex-1" />
        {error && <span className={`text-xs text-error ${desktop ? "hidden xl:inline" : ""}`}>{error}</span>}
        {desktop ? <div className="hidden xl:flex">{ConnectionIndicator(connection, error)}</div> : ConnectionIndicator(connection, error)}
        {board && (
          <span className={`text-xs text-text-secondary ${desktop ? "hidden xl:inline" : ""}`}>
            updated {formatRelativeTimeVerbose(board.generated_at)}
          </span>
        )}
        <button
          type="button"
          onClick={showStatistics ? backToBoard : openStatistics}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${showStatistics ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-secondary hover:text-accent hover:border-accent/40"}`}
          aria-pressed={showStatistics}
          data-testid="statistics-button"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Statistics
        </button>
        <button type="button" onClick={page === "office" ? backToBoard : openOffice} aria-pressed={page === "office"} data-testid="office-button"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${page === "office" ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-secondary hover:text-accent hover:border-accent/40"}`}>
          <Building2 className="w-3.5 h-3.5" />Office
        </button>
        {desktop && <button type="button" onClick={() => notifyNativeAction("notification-settings")} data-testid="notification-settings-button"
          aria-label="Notification settings" title="Notification settings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
          <Settings2 className="w-3.5 h-3.5" /><span className="hidden 2xl:inline">Notifications</span>
        </button>}
        {desktop && <ShortcutHelp />}
      </header>

      {showStatistics && (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center gap-3 text-text-secondary"><Loader2Impl /><span>Loading statistics…</span></div>}>
          <Statistics activeSessionIds={activeSessionIds} onBoard={openBoardSession} onQueryChange={rememberStatisticsSearch} />
        </Suspense>
      )}

      {page === "office" && <main className="office-view flex-1 min-h-0 flex">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-secondary">Loading office…</div>}>
          <Office board={board} now={now} isRead={isRead} onSelect={select} onBack={backToBoard} />
        </Suspense>
        {selectedId && <DetailsPanel sessionId={selectedId} onClose={closeDetails} />}
      </main>}

      <main className="flex-1 min-h-0 flex" style={page !== "board" ? { display: "none" } : undefined}>
        <RecentSessions sessions={recent.data?.sessions ?? []} collapsed={historyCollapsed} selectedId={selectedId}
          pending={recent.pending} error={recent.error ? "Recent sessions temporarily unavailable" : null}
          onSelect={select} onResume={desktop ? notifyNativeResume : undefined}
          onToggle={() => { const collapsed = !historyCollapsed; setHistoryCollapsed(collapsed); setRecentSessionsCollapsed(collapsed); }} />
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-secondary" data-testid="loading-screen">
            <Loader2Impl />
            <p className="text-sm">Loading sessions…</p>
            {error && <p className="text-xs text-error">{error}</p>}
          </div>
        ) : (
          <>
            <div className={`flex-1 min-w-0 grid gap-3 p-3 ${selectedId ? "grid-cols-1 xl:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
              {(["attention", "running", "idle"] as ColumnKey[]).map((key) => (
                <BoardColumn
                  key={key}
                  columnKey={key}
                  column={board?.columns[key] ?? { title: key, count: 0, cards: [] }}
                  selectedId={selectedId}
                  activeTerminalId={activeTerminalId}
                  now={now}
                  isRead={isRead}
                  onSelect={select}
                />
              ))}
            </div>
            {page === "board" && selectedId && (
              <DetailsPanel sessionId={selectedId} onClose={closeDetails} />
            )}
          </>
        )}
      </main>

      <StatusBar
        sessionCount={
          board ? board.columns.attention.count + board.columns.running.count + board.columns.idle.count : 0
        }
        projectCount={board?.project_count ?? 0}
        running={counts.running}
        agentsRunning={counts.agents_running}
        subagentsRunning={counts.subagents_running}
        unread={counts.unread}
        agents={board?.agents ?? []}
      />
    </div>
  );
}

function Loader2Impl() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-accent animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" pathLength="100" strokeDasharray="75 25" />
    </svg>
  );
}

function findCard(
  board: NonNullable<ReturnType<typeof useBoard>["board"]>,
  sessionId: string,
): TrackedCard | null {
  for (const key of ["attention", "running", "idle"] as ColumnKey[]) {
    const found = sessionCards(board.columns[key].cards).find((card) => card.session_id === sessionId);
    if (found) return found;
  }
  return null;
}

export type { CardPayload };
