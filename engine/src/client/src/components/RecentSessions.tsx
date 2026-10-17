import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, History, Loader2, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, SquareTerminal, X } from "lucide-react";
import type { RecentSessionsPayload, UsageSession } from "@shared/usage";
import { formatRelativeTime } from "@shared/format";
import { HarnessIcon } from "./HarnessIcon";
import { RecentSessionFilter } from "./RecentSessionFilter";
import { useStatsRequest } from "../statistics/useStatsRequest";
import "./recent-sessions.css";

interface Props {
  sessions: UsageSession[];
  total?: number;
  projects?: string[];
  now?: number;
  collapsed: boolean;
  selectedId: string | null;
  pending: boolean;
  error: string | null;
  onToggle: () => void;
  onSelect: (id: string, directory: string) => void;
  onResume?: (id: string, directory: string) => void;
}

function projectName(directory: string) { return directory.split("/").filter(Boolean).at(-1) || "/"; }
const WIDTH_KEY = "kliprun.recent-sessions.width";

export function RecentSessions({ sessions, total = sessions.length, projects, now = Date.now(), collapsed, selectedId, pending, error, onToggle, onSelect, onResume }: Props) {
  const [width, setWidth] = useState<number | null>(() => {
    try { const saved = Number(localStorage.getItem(WIDTH_KEY)); return saved >= 176 && saved <= 480 ? saved : null; }
    catch { return null; }
  });
  const [viewport, setViewport] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  const [resizing, setResizing] = useState(false);
  const sidebar = useRef<HTMLElement>(null), drag = useRef<{ x: number; width: number } | null>(null);
  const maximum = Math.max(176, Math.min(480, viewport - 340));
  const visibleWidth = Math.min(width ?? (viewport <= 600 ? 176 : viewport <= 1100 ? 192 : 208), maximum);
  function resize(value: number) { setWidth(Math.max(176, Math.min(maximum, value))); }
  function stopResize() { drag.current = null; setResizing(false); }
  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => { try { if (width !== null) localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* storage unavailable */ } }, [width]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (query.trim() === search) return;
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  const after = useMemo(() => {
    if (!period) return 0;
    const date = new Date(now); date.setHours(0, 0, 0, 0);
    if (period !== "today") date.setDate(date.getDate() - Number(period) + 1);
    return date.getTime();
  }, [period, now]);
  const filtered = !!(search || source || project || period || page);
  const parameters = new URLSearchParams({ page: String(page), limit: "50" });
  if (search) parameters.set("search", search);
  if (source) parameters.set("source", source);
  if (project) parameters.set("project", project);
  if (period) parameters.set("after", String(after));
  const request = useStatsRequest<RecentSessionsPayload>(!collapsed && filtered ? `/api/recent-sessions?${parameters}` : null, 0);
  const rows = filtered ? request.data?.sessions ?? [] : sessions;
  const count = filtered ? request.data?.total ?? 0 : total;
  const loading = query.trim() !== search || (filtered ? request.pending : pending);
  const failure = filtered ? request.error ? "Unable to load session history. Try again in a moment." : null : error;
  const projectOptions = [...new Set([...(projects ?? sessions.map(session => session.directory)), ...(project ? [project] : [])])].sort();
  const filterCount = Number(!!source) + Number(!!project) + Number(!!period);
  function clearAll() { setQuery(""); setSearch(""); setSource(""); setProject(""); setPeriod(""); setPage(0); }

  return <aside ref={sidebar} aria-label="Recent sessions" aria-busy={loading} data-resizing={resizing}
    style={{ "--recent-width": `${visibleWidth}px` } as CSSProperties} className={`recent-sessions ${collapsed ? "is-collapsed" : ""}`}>
    <div className="recent-heading">
      {!collapsed && <><History size={14} /><h2>Recent Sessions</h2><span className="recent-total" title="Matching sessions">{loading ? "…" : count}</span></>}
      <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Show recent sessions" : "Hide recent sessions"}
        title={collapsed ? "Show recent sessions" : "Hide recent sessions"} className="recent-icon-button">
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>
    </div>
    {!collapsed && <>
      <div role="separator" aria-orientation="vertical" aria-label="Resize recent sessions" tabIndex={0}
        aria-valuemin={176} aria-valuemax={maximum} aria-valuenow={visibleWidth} className="recent-resize-handle"
        onPointerDown={event => {
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, width: sidebar.current?.getBoundingClientRect().width ?? visibleWidth };
          setResizing(true); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
        }}
        onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
        onPointerUp={event => {
          stopResize(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }} onPointerCancel={stopResize} onLostPointerCapture={stopResize}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault(); resize(visibleWidth + (event.key === "ArrowRight" ? 20 : -20));
        }} />
      <div className="recent-search-tools">
        <div className="recent-search"><Search size={13} /><input type="search" aria-label="Search sessions" placeholder="Search sessions…"
          title="Search all indexed sessions by title, project or folder path" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} />
          {query && <button type="button" aria-label="Clear search" className="recent-icon-button" onClick={() => { setQuery(""); setSearch(""); setPage(0); }}><X size={12} /></button>}
        </div>
        <button type="button" className={`recent-icon-button recent-filter-toggle ${filterCount ? "is-active" : ""}`} aria-label="Filter sessions"
          title="Filter by agent, project and last update" aria-expanded={filtersOpen} aria-controls="recent-session-filters" onClick={() => setFiltersOpen(value => !value)}>
          <SlidersHorizontal size={14} />{filterCount > 0 && <span>{filterCount}</span>}
        </button>
      </div>
      {filtersOpen && <div className="recent-filters" id="recent-session-filters">
        <RecentSessionFilter label="Agent" name="Session agent" value={source} onChange={value => { setSource(value); setPage(0); }}
          options={[{ value: "", label: "All agents" }, { value: "codex", label: "Codex" }, { value: "opencode", label: "OpenCode" }]} />
        <RecentSessionFilter label="Project" name="Session project" value={project} searchable onChange={value => { setProject(value); setPage(0); }}
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(directory => ({ value: directory, label: projectName(directory), path: directory }))]} />
        <RecentSessionFilter label="Updated" name="Updated period" value={period} onChange={value => { setPeriod(value); setPage(0); }}
          options={[{ value: "", label: "All time" }, { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }]} />
      </div>}
      {(query || filterCount > 0) && <div className="recent-active-filters"><span>{filterCount ? `${filterCount} filter${filterCount === 1 ? "" : "s"} applied` : "Search results"}</span>
        <button type="button" aria-label="Clear search and filters" onClick={clearAll}>Clear all</button></div>}
      <div className="recent-session-list">
        {failure && <p role="alert" className="recent-error">{failure}</p>}
        {loading && !rows.length && <div className="recent-empty" role="status"><Loader2 size={16} className="animate-spin" /><span>Loading sessions…</span></div>}
        {!loading && !rows.length && !failure && <div className="recent-empty"><History size={22} /><strong>{filtered ? "No matching sessions" : "No session history yet"}</strong>
          <span>{filtered ? "Try fewer words or clear the filters." : "Sessions appear here after using Codex or OpenCode."}</span>
          {filtered && <button type="button" onClick={clearAll}>Show all sessions</button>}
        </div>}
        <ul>{rows.map(session => {
          const title = session.title || "Untitled session", agent = session.source === "codex" ? "Codex" : "OpenCode";
          const updated = new Date(session.updated_at);
          const description = `${title}\n${agent} · ${session.directory}\nUpdated ${updated.toLocaleString("en-US")}`;
          return <li key={session.id} className={`recent-session-row ${selectedId === session.id ? "is-selected" : ""}`}>
            <button type="button" className="recent-session-select" aria-label={`Open session: ${title}`} aria-pressed={selectedId === session.id}
              title={description} disabled={loading} onClick={() => onSelect(session.id, session.directory)}>
              <HarnessIcon source={session.source} className="recent-agent-icon" />
              <span className="recent-session-text"><span className="recent-session-title">{title}</span>
                <span className="recent-session-meta"><span title={session.directory}>{projectName(session.directory)}</span>
                  <time dateTime={updated.toISOString()} title={`Updated ${updated.toLocaleString("en-US")}`}>{now - session.updated_at >= 7 * 86_400_000 ? updated.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : formatRelativeTime(session.updated_at)}</time>
                </span>
              </span>
            </button>
            {onResume && <button type="button" className="recent-icon-button recent-resume" disabled={loading} onClick={() => onResume(session.id, session.directory)}
              title={`Resume in ${agent}: ${title}`} aria-label={`Resume in ${agent}: ${title}`}><SquareTerminal size={14} /></button>}
          </li>;
        })}</ul>
      </div>
      <div className="recent-pagination">
        <button type="button" className="recent-icon-button" aria-label="Previous sessions" title="Previous sessions" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={14} /></button>
        <span role="status">{loading ? "Searching…" : rows.length ? `${page * 50 + 1}–${page * 50 + rows.length} of ${count}` : `${count} sessions`}</span>
        <button type="button" className="recent-icon-button" aria-label="Next sessions" title="Older sessions" disabled={loading || (page + 1) * 50 >= count} onClick={() => setPage(value => value + 1)}><ChevronRight size={14} /></button>
      </div>
    </>}
  </aside>;
}
