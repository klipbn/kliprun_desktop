import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, BarChart3, Building2, Columns3, Gauge, GitBranch, Settings2, SquareTerminal } from "lucide-react";
import type { CardPayload, ColumnKey } from "@shared/types";
import { sessionCards } from "@shared/readTracker";
import { linkedSessionId } from "@shared/sessionLink";
import { availableUpdateVersion, hasDesktopBridge, notifyNativeAction, notifyNativeSelection, notifyNativeResume, observeNativeNavigation, observeNativeTerminalSelection, observeNativeUpdate, recentSessionsCollapsed, setRecentSessionsCollapsed } from "./nativeBridge";
import { useBoard, useNow } from "./hooks/useBoard";
import { useDesktopPreferences } from "./hooks/useDesktopPreferences";
import { useReadTracker } from "./hooks/useReadTracker";
import { BoardColumn } from "./components/BoardColumn";
import { DetailsPanel } from "./components/DetailsPanel";
import { StatusBar } from "./components/StatusBar";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { RecentSessions } from "./components/RecentSessions";
import { HarnessIcon } from "./components/HarnessIcon";
import { useStatsRequest } from "./statistics/useStatsRequest";
import type { UsageSession } from "@shared/usage";
import { formatRelativeTimeVerbose } from "@shared/format";
import { useQuotas } from "./quota/useQuotas";
import { StatusQuota } from "./quota/StatusQuota";
import { loadCardPriorities, saveCardPriorities, updateCardPriority, type CardPriority } from "./cardPriorities";
import { loadCardOrder, saveCardOrder, type CardOrder } from "./cardOrder";

const Statistics = lazy(() => import("./statistics/Statistics"));
const Office = lazy(() => import("./office/Office"));
const Usage = lazy(() => import("./quota/Usage"));
const Git = lazy(() => import("./git/Git"));
const HEADER_BUTTON = "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

function currentPage() {
  return window.location.pathname === "/git" ? "git" : window.location.pathname === "/stats" ? "stats" : window.location.pathname === "/office" ? "office" : window.location.pathname === "/usage" ? "usage" : "board";
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
  const preferences = useDesktopPreferences();
  const { board, connection, error } = useBoard();
  const desktop = hasDesktopBridge();
  const [updateVersion, setUpdateVersion] = useState(availableUpdateVersion);
  const [historyCollapsed, setHistoryCollapsed] = useState(recentSessionsCollapsed);
  const recent = useStatsRequest<{ sessions: UsageSession[] }>("/api/recent-sessions", 0);
  const now = useNow();
  const quotaState = useQuotas();
  const { isRead, counts, markRead } = useReadTracker(board);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState(loadCardPriorities);
  const [cardOrder, setCardOrder] = useState(loadCardOrder);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [linkedId, setLinkedId] = useState(() => linkedSessionId(window.location.search));
  const [page, setPage] = useState(currentPage);
  const showStatistics = page === "stats";
  const statisticsSearch = useRef(showStatistics ? window.location.search : "");
  const gitDirectories = useMemo(() => [...new Set([
    ...(board ? sessionCards(Object.values(board.columns).flatMap(column => column.cards)).map(card => card.directory) : []),
    ...(recent.data?.sessions.map(session => session.directory) ?? []),
  ])].filter(Boolean), [board, recent.data]);
  const gitInitialDirectory = (selectedId && board ? findCard(board, selectedId)?.directory : null)
    ?? recent.data?.sessions.find(session => session.id === selectedId)?.directory ?? null;
  const activeSessionIds = useMemo(() => new Set(board ? sessionCards([
    ...board.columns.attention.cards,
    ...board.columns.running.cards,
    ...board.columns.idle.cards,
  ]).map((card) => card.session_id) : []), [board]);

  useEffect(() => {
    return observeNativeTerminalSelection(id => {
      setActiveTerminalId(id);
      if (id) setSelectedId(id);
    });
  }, []);
  useEffect(() => observeNativeUpdate(setUpdateVersion), []);
  useEffect(() => saveCardPriorities(priorities), [priorities]);
  useEffect(() => saveCardOrder(cardOrder), [cardOrder]);
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
  const openUsage = useCallback(() => {
    if (window.location.pathname === "/stats") statisticsSearch.current = window.location.search;
    window.history.pushState(null, "", "/usage");
    setPage("usage");
  }, []);
  const openGit = useCallback(() => {
    if (window.location.pathname === "/stats") statisticsSearch.current = window.location.search;
    window.history.pushState(null, "", "/git");
    setPage("git");
  }, []);
  useEffect(() => observeNativeNavigation(path => {
    if (path === "/") backToBoard();
    else if (path === "/stats") openStatistics();
    else if (path === "/office") openOffice();
    else if (path === "/usage") openUsage();
    else if (path === "/git") openGit();
  }), [backToBoard, openStatistics, openOffice, openUsage, openGit]);
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
      if (card?.terminal?.session_id === null) return;
      if (card?.column === "idle") markRead(card);
      notifyNativeSelection(id);
      setSelectedId(id);
    },
    [board, markRead],
  );

  const changePriority = useCallback((id: string, priority: CardPriority | null) => {
    setPriorities(current => updateCardPriority(current, id, priority));
  }, []);

  const changeCardOrder = useCallback((column: ColumnKey, ids: string[]) => {
    setCardOrder((current: CardOrder) => ({ ...current, [column]: ids }));
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    notifyNativeSelection(null);
  }, []);

  const loading = board === null;

  return (
    <div className={`h-screen flex flex-col bg-background text-text-primary ${preferences.reduceMotion ? "reduce-office-motion" : ""}`}>
      <header className={`relative shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border bg-surface ${desktop ? "md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : ""}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <img src="/kliprun-icon.png" alt="" className="w-6 h-6" />
            <h1 className="font-semibold text-lg">KlipRun</h1>
          </div>
          {error && <span className={`text-xs text-error ${desktop ? "hidden 2xl:inline" : ""}`}>{error}</span>}
          {desktop ? <div className="hidden 2xl:flex">{ConnectionIndicator(connection, error)}</div> : ConnectionIndicator(connection, error)}
          {board && (
            <span className={`text-xs text-text-secondary ${desktop ? "hidden 2xl:inline" : ""}`}>
              updated {formatRelativeTimeVerbose(board.generated_at)}
            </span>
          )}
        </div>
        {desktop && <div className="order-last w-full flex justify-center items-center gap-1.5 md:order-none md:w-auto" aria-label="Agent terminals">
          <button type="button" onClick={() => notifyNativeAction("new-opencode")} data-testid="new-opencode-button"
            aria-label="New OpenCode" title="New OpenCode (⌘⇧O)" className={`${HEADER_BUTTON} border-border text-white hover:bg-white/10`}>
            <HarnessIcon source="opencode" className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => notifyNativeAction("new-codex")} data-testid="new-codex-button"
            aria-label="New Codex" title="New Codex (⌘⇧C)" className={`${HEADER_BUTTON} border-border text-white hover:bg-white/10`}>
            <HarnessIcon source="codex" className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => notifyNativeAction("show-terminal")} data-testid="show-terminal-button"
            aria-label="Terminal" title="Show or hide terminal (⌘J)" className={`${HEADER_BUTTON} border-border text-white hover:bg-white/10`}>
            <SquareTerminal className="w-4 h-4" />
          </button>
        </div>}
        <div className={`ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 ${desktop ? "md:ml-0" : ""}`}>
          <nav className="flex items-center gap-1.5" aria-label="Views">
            {[
              { id: "kanban", label: "Kanban", page: "board", icon: Columns3, shortcut: 1, onClick: backToBoard },
              { id: "git", label: "Git", page: "git", icon: GitBranch, shortcut: 2, onClick: openGit },
              { id: "office", label: "Office", page: "office", icon: Building2, shortcut: 3, onClick: page === "office" ? backToBoard : openOffice },
              { id: "usage", label: "Usage", page: "usage", icon: Gauge, shortcut: 4, onClick: page === "usage" ? backToBoard : openUsage },
              { id: "statistics", label: "Statistics", page: "stats", icon: BarChart3, shortcut: 5, onClick: showStatistics ? backToBoard : openStatistics },
            ].map(item => <button key={item.id} type="button" onClick={item.onClick} aria-label={item.label}
              aria-pressed={page === item.page} data-testid={`${item.id}-button`} title={`${item.label} (Control+${item.shortcut})`}
              className={`${HEADER_BUTTON} text-white hover:bg-white/10 ${page === item.page ? "border-accent/40 bg-accent/10" : "border-border"}`}>
              <item.icon className="w-4 h-4" />
            </button>)}
            {desktop && <button type="button" onClick={() => notifyNativeAction("settings")} data-testid="settings-button"
              aria-label="Settings" title="Settings (⌘,)" className={`${HEADER_BUTTON} border-border text-white hover:bg-white/10`}>
              <Settings2 className="w-4 h-4" />
            </button>}
          </nav>
          {desktop && <div className="flex items-center gap-1.5 border-l border-border pl-2" aria-label="Utilities">
            <button type="button" onClick={() => notifyNativeAction("check-updates")} data-testid="check-updates-button"
              aria-label={updateVersion ? `Update available: KlipRun ${updateVersion}` : "Check for Updates"}
              title={updateVersion ? `KlipRun ${updateVersion} is available` : "Check for Updates…"}
              className={`relative ${HEADER_BUTTON} ${updateVersion ? "border-warning/60 bg-warning/10 text-warning hover:bg-warning/20" : "border-border text-white hover:bg-white/10"}`}>
              <ArrowDownToLine className="w-4 h-4" />
              {updateVersion && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />}
            </button>
            <ShortcutHelp />
          </div>}
        </div>
      </header>

      {page === "git" && <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-secondary">Loading Git…</div>}>
        <Git directories={gitDirectories} initialDirectory={gitInitialDirectory} />
      </Suspense>}

      {showStatistics && (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center gap-3 text-text-secondary"><Loader2Impl /><span>Loading statistics…</span></div>}>
          <Statistics activeSessionIds={activeSessionIds} onBoard={openBoardSession} onQueryChange={rememberStatisticsSearch} />
        </Suspense>
      )}

      {page === "office" && <main className="office-view flex-1 min-h-0 flex">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-secondary">Loading office…</div>}>
          <Office board={board} now={now} isRead={isRead} activeTerminalId={activeTerminalId} onSelect={select} onBack={backToBoard} />
        </Suspense>
        {selectedId && <DetailsPanel sessionId={selectedId} onClose={closeDetails} />}
      </main>}

      {page === "usage" && <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-secondary">Loading usage…</div>}>
        <Usage {...quotaState} now={now} />
      </Suspense>}

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
                  order={cardOrder[key]}
                  onOrderChange={changeCardOrder}
                  column={board?.columns[key] ?? { title: key, count: 0, cards: [] }}
                  selectedId={selectedId}
                  activeTerminalId={activeTerminalId}
                  now={now}
                  isRead={isRead}
                  priorities={priorities}
                  onPriorityChange={changePriority}
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
        usage={<StatusQuota {...quotaState} now={now} onOpen={openUsage} />}
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
): CardPayload | null {
  for (const key of ["attention", "running", "idle"] as ColumnKey[]) {
    const found = sessionCards(board.columns[key].cards).find((card) => card.session_id === sessionId);
    if (found) return found;
  }
  return null;
}

export type { CardPayload };
