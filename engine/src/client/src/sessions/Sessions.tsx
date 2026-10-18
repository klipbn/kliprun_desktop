import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock3, Folder, History, Plus, Search, SquareTerminal, Star, X } from "lucide-react";
import type { CatalogSession } from "@shared/usage";
import type { CardPayload } from "@shared/types";
import { HarnessIcon } from "../components/HarnessIcon";
import { duration as formatDuration } from "../statistics/format";
import { createGroup, createProject, groupFor, loadWorkspace, moveSessions, projectFor, saveWorkspace, sortSessions, type SessionWorkspace } from "./model";
import "./sessions.css";

interface Props {
  menuRequest?: "new-project" | "find" | null;
  onMenuRequestHandled?: () => void;
  sessions: CatalogSession[];
  cards: Map<string, CardPayload>;
  pending: boolean;
  error: string | null;
  selectedId: string | null;
  onRetry: () => void;
  onSelect: (id: string, directory: string) => void;
  onResume?: (id: string, directory: string) => void;
}
type View = { kind: "all" | "favorites" } | { kind: "project"; id: string };
type Dialog = { kind: "project" } | { kind: "group"; projectId: string } | { kind: "move"; ids: string[] };
interface Section { id: string; name: string; rows: CatalogSession[]; projectId?: string | null; groupId?: string | null }
const PAGE_SIZE = 100;
const duration = (value: number | null) => value === null ? "—" : formatDuration(value);
function updated(at: number) {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Sessions({ menuRequest, onMenuRequestHandled, sessions, cards, pending, error, selectedId, onRetry, onSelect, onResume }: Props) {
  const [state, setState] = useState(loadWorkspace);
  const [view, setView] = useState<View>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [grouping, setGrouping] = useState("project");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [undo, setUndo] = useState<SessionWorkspace["assignments"] | null>(null);
  const [notice, setNotice] = useState("");
  const dragIds = useRef<string[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!menuRequest) return;
    if (menuRequest === "new-project") setDialog({ kind: "project" });
    else { setView({ kind: "all" }); setSource(""); setPage(0); searchInput.current?.focus(); searchInput.current?.select(); }
    onMenuRequestHandled?.();
  }, [menuRequest, onMenuRequestHandled]);
  const currentProject = view.kind === "project" ? state.projects.find(p => p.id === view.id) : undefined;
  const heading = currentProject?.name ?? (view.kind === "favorites" ? "Favorites" : "All sessions");
  const change = (next: SessionWorkspace) => {
    try { saveWorkspace(next); setState(next); setFailure(null); return true; }
    catch (err) { setFailure(err instanceof Error ? err.message : "Unable to save workspace."); return false; }
  };
  const navigate = (next: View) => { setView(next); setSelected([]); setPage(0); };
  const resetFilters = () => { setSearch(""); setSource(""); setPage(0); };
  useEffect(() => { setPage(0); setSelected([]); }, [search, source, grouping]);
  const sections = useMemo(() => {
    const terms = search.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = sortSessions(sessions.filter(s => (!source || s.source === source)
      && (view.kind === "all" || view.kind === "favorites" && state.favorites.includes(s.id) || view.kind === "project" && projectFor(state, s.id)?.id === view.id)
      && terms.every(term => `${s.title} ${s.directory} ${projectFor(state, s.id)?.name ?? ""} ${groupFor(state, s.id)?.name ?? ""}`.normalize("NFKC").toLowerCase().includes(term))), state);
    let result: Section[];
    if (currentProject && grouping === "project") result = [
      ...currentProject.groups.map(g => ({ id: `group:${currentProject.id}:${g.id}`, name: g.name, projectId: currentProject.id, groupId: g.id, rows: rows.filter(s => groupFor(state, s.id)?.id === g.id) })),
      { id: `group:${currentProject.id}:none`, name: "Uncategorized", projectId: currentProject.id, groupId: null, rows: rows.filter(s => !groupFor(state, s.id)) },
    ];
    else if (grouping === "project") result = [
      ...state.projects.map(p => ({ id: `project:${p.id}`, name: p.name, projectId: p.id, groupId: null, rows: rows.filter(s => projectFor(state, s.id)?.id === p.id) })),
      { id: "unassigned", name: "No project", projectId: null, groupId: null, rows: rows.filter(s => !projectFor(state, s.id)) },
    ];
    else if (view.kind === "all") result = [
      { id: "assigned-recent", name: "Assigned to projects", rows: rows.filter(s => projectFor(state, s.id)) },
      { id: "unassigned", name: "No project", projectId: null, groupId: null, rows: rows.filter(s => !projectFor(state, s.id)) },
    ];
    else result = [{ id: `recent:${heading}`, name: "Recently updated", rows }];
    return result.filter(section => section.rows.length || currentProject && grouping === "project" && !search && !source && currentProject.groups.length);
  }, [sessions, state, view, source, search, grouping, currentProject, heading]);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1), activePage = Math.min(page, lastPage);
  let offset = 0;
  const visibleSections = sections.map(section => {
    const start = offset; offset += section.rows.length;
    return { ...section, count: section.rows.length, rows: section.rows.slice(Math.max(0, activePage * PAGE_SIZE - start), Math.max(0, (activePage + 1) * PAGE_SIZE - start)) };
  }).filter(s => s.rows.length || !s.count && activePage === 0);
  const allCollapsed = !!sections.length && sections.every(s => state.collapsed.includes(s.id));
  const collapse = (id: string) => change({ ...state, collapsed: state.collapsed.includes(id) ? state.collapsed.filter(s => s !== id) : [...state.collapsed, id] });
  const move = (ids: string[], projectId: string | null, groupId: string | null) => {
    try {
      const next = moveSessions(state, ids, projectId, groupId);
      next.collapsed = next.collapsed.filter(id => id !== `project:${projectId}` && id !== `group:${projectId}:${groupId ?? "none"}` && !(projectId === null && id === "unassigned"));
      if (!change(next)) return false;
      setUndo(state.assignments); setNotice(`${ids.length} session${ids.length === 1 ? "" : "s"} moved`); setSelected([]); return true;
    } catch (err) { setFailure(err instanceof Error ? err.message : "Unable to move sessions."); return false; }
  };
  const drop = (event: DragEvent, projectId: string | null, groupId: string | null) => {
    event.preventDefault(); event.currentTarget.classList.remove("is-drop-target");
    if (dragIds.current.length) move(dragIds.current, projectId, groupId);
    dragIds.current = [];
  };
  const dragOver = (event: DragEvent) => { if (dragIds.current.length) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; event.currentTarget.classList.add("is-drop-target"); } };
  const dragLeave = (event: DragEvent) => event.currentTarget.classList.remove("is-drop-target");

  return <section className="session-workspace" aria-label="Session workspace">
    <aside className="sw-sidebar" aria-label="Session views">
      <button className={view.kind === "all" ? "is-active" : ""} onClick={() => navigate({ kind: "all" })} aria-current={view.kind === "all" ? "page" : undefined}><History /><span>All sessions</span><small>{sessions.length}</small></button>
      <button className={view.kind === "favorites" ? "is-active" : ""} onClick={() => navigate({ kind: "favorites" })} aria-current={view.kind === "favorites" ? "page" : undefined}><Star /><span>Favorites</span><small>{sessions.filter(s => state.favorites.includes(s.id)).length}</small></button>
      <div className="sw-project-heading"><button onClick={() => change({ ...state, sidebarCollapsed: !state.sidebarCollapsed })} aria-expanded={!state.sidebarCollapsed} aria-controls="sw-projects">{state.sidebarCollapsed ? <ChevronRight /> : <ChevronDown />}Projects</button><button className="sw-icon" onClick={() => setDialog({ kind: "project" })} aria-label="New project" title="New project"><Plus /></button></div>
      <div id="sw-projects" hidden={state.sidebarCollapsed}>{state.projects.map(p => <button key={p.id} className={currentProject?.id === p.id ? "is-active" : ""} onClick={() => navigate({ kind: "project", id: p.id })}
        onDragOver={dragOver} onDragLeave={dragLeave} onDrop={event => drop(event, p.id, null)} aria-current={currentProject?.id === p.id ? "page" : undefined} title={p.name}>
        <Folder /><span>{p.name}</span><small>{sessions.filter(s => projectFor(state, s.id)?.id === p.id).length}</small></button>)}
        {!state.projects.length && <p className="sw-sidebar-hint">Create a project to organize sessions.</p>}
      </div>
    </aside>
    <div className="sw-content">
      <header className="sw-toolbar"><div className="sw-title"><h1 title={heading}>{heading}</h1><button className="sw-icon" aria-label={allCollapsed ? "Expand all groups" : "Collapse all groups"} title={allCollapsed ? "Expand all groups" : "Collapse all groups"} disabled={!sections.length}
        onClick={() => change({ ...state, collapsed: allCollapsed ? state.collapsed.filter(id => !sections.some(s => s.id === id)) : [...new Set([...state.collapsed, ...sections.map(s => s.id)])] })}>{allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}</button></div>
        <div className="sw-filters">{currentProject && <button onClick={() => setDialog({ kind: "group", projectId: currentProject.id })}><Plus /> New group</button>}
          <label className="sw-search"><Search /><input ref={searchInput} type="search" aria-label="Search sessions" placeholder="Search sessions…" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /></label>
          <select aria-label="Session agent" value={source} onChange={e => setSource(e.target.value)}><option value="">All agents</option><option value="codex">Codex</option><option value="opencode">OpenCode</option></select>
          <select aria-label="Group sessions by" value={grouping} onChange={e => setGrouping(e.target.value)}><option value="project">{currentProject ? "Group" : "Project"}</option><option value="recent">Last updated</option></select>
        </div>
      </header>
      {(error || failure) && <div className="sw-error" role="alert">{failure ?? "Unable to refresh sessions. Your saved organization is unchanged."}<button onClick={() => { setFailure(null); onRetry(); }}>Retry</button></div>}
      {notice && <div className="sw-notice" role="status">{notice}{undo && <button onClick={() => { if (change({ ...state, assignments: undo })) { setUndo(null); setNotice("Move undone"); } }}>Undo</button>}<button className="sw-icon" aria-label="Dismiss notice" onClick={() => { setNotice(""); setUndo(null); }}><X /></button></div>}
      {!!selected.length && <div className="sw-batch"><strong>{selected.length} selected</strong><button onClick={() => setDialog({ kind: "move", ids: selected })}><Folder /> Move to…</button><button onClick={() => { if (change({ ...state, favorites: [...new Set([...state.favorites, ...selected])] })) setSelected([]); }}><Star /> Favorite</button><button className="sw-icon" aria-label="Clear selection" onClick={() => setSelected([])}><X /></button></div>}
      <div className="sw-column-labels" aria-hidden="true"><span>Session</span><div><span>Worked</span></div><span>Updated</span><i /></div>
      <div className="sw-list" aria-busy={pending && !sessions.length}>
        {visibleSections.map(section => <section className="sw-section" key={section.id}>
          <button className="sw-section-heading" aria-expanded={!state.collapsed.includes(section.id)} aria-controls={`sw-section-${section.id}`} onClick={() => collapse(section.id)}
            onDragOver={section.projectId !== undefined ? dragOver : undefined} onDragLeave={dragLeave} onDrop={section.projectId !== undefined ? event => drop(event, section.projectId ?? null, section.groupId ?? null) : undefined}>
            {state.collapsed.includes(section.id) ? <ChevronRight /> : <ChevronDown />}<Folder /><span>{section.name}</span><small>{section.count}</small>
          </button>
          <div id={`sw-section-${section.id}`} hidden={state.collapsed.includes(section.id)}>
            {!section.count && <p className="sw-group-empty">Move sessions here</p>}
            {section.rows.map(session => {
              const card = cards.get(session.id), favorite = state.favorites.includes(session.id);
              const status = card ? card.column === "running" ? "Running" : card.column === "attention" ? "Needs attention" : "Idle" : "Not on board";
              return <div className={`sw-row ${selected.includes(session.id) || selectedId === session.id ? "is-selected" : ""}`} key={session.id} draggable
                onDragStart={event => { dragIds.current = selected.includes(session.id) ? selected : [session.id]; event.dataTransfer.setData("text/plain", JSON.stringify(dragIds.current)); event.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { dragIds.current = []; document.querySelectorAll(".is-drop-target").forEach(e => e.classList.remove("is-drop-target")); }}>
                <input type="checkbox" aria-label={`Select ${session.title}`} checked={selected.includes(session.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, session.id] : ids.filter(id => id !== session.id))} />
                <button className="sw-open" aria-label={`Open session: ${session.title}`} onClick={() => onSelect(session.id, session.directory)} title={`${session.title}\n${session.directory}`}>
                  <HarnessIcon source={session.source} className="sw-agent" /><span className="sw-row-text"><span className="sw-session-title"><i className={`sw-status ${card?.column ?? ""}`} title={status} /><span>{session.title || "Untitled session"}</span></span>
                  <span className="sw-metrics"><span title="Observed running time; excludes idle time and subagents"><Clock3 />{duration(session.running_ms)}</span></span></span>
                </button>
                <time className="sw-updated" title={new Date(session.updated_at).toLocaleString("en-US")}>{updated(session.updated_at)}</time>
                <button className="sw-icon sw-move" aria-label={`Move ${session.title}`} title="Move to project or group" onClick={() => setDialog({ kind: "move", ids: [session.id] })}><Folder /></button>
                <button className={`sw-icon sw-star ${favorite ? "is-favorite" : ""}`} aria-label={`Favorite ${session.title}`} aria-pressed={favorite} title={favorite ? "Remove favorite" : "Add favorite"} onClick={() => change({ ...state, favorites: favorite ? state.favorites.filter(id => id !== session.id) : [...state.favorites, session.id] })}><Star /></button>
                {onResume && <button className="sw-icon sw-resume" aria-label={`Resume ${session.title}`} title={`Resume in ${session.source === "codex" ? "Codex" : "OpenCode"}`} onClick={() => onResume(session.id, session.directory)}><SquareTerminal /></button>}
              </div>;
            })}
          </div>
        </section>)}
        {!sections.length && <div className="sw-empty"><Folder /><h2>{pending ? "Loading sessions…" : error ? "Sessions unavailable" : search || source ? "No matching sessions" : view.kind === "favorites" ? "No favorites yet" : "No sessions"}</h2><p>{search || source ? "Try another search or agent." : view.kind === "favorites" ? "Star a session to find it here." : currentProject ? "Assign sessions from All sessions using Move to…." : "Sessions appear here after using Codex or OpenCode."}</p>{(search || source) && <button onClick={resetFilters}>Clear filters</button>}{currentProject && !search && !source && <button onClick={() => navigate({ kind: "all" })}>All sessions</button>}</div>}
      </div>
      <footer className="sw-footer"><span>{total} sessions{pending && sessions.length ? " · Updating…" : ""}</span>{lastPage > 0 && <div><button aria-label="Previous sessions" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>‹</button><span>{activePage + 1} / {lastPage + 1}</span><button aria-label="Next sessions" disabled={activePage === lastPage} onClick={() => setPage(activePage + 1)}>›</button></div>}<span className="sw-footer-hint">{currentProject ? "Drag to a group to organize" : "Drag to a project to move"}</span></footer>
    </div>
    {dialog && <WorkspaceDialog dialog={dialog} state={state} onClose={() => setDialog(null)} onMove={move} onCreate={(name) => {
      const id = crypto.randomUUID();
      const next = dialog.kind === "group" ? createGroup(state, dialog.projectId, id, name) : createProject(state, id, name);
      if (!change(next)) return false;
      resetFilters(); setGrouping("project");
      if (dialog.kind === "project") navigate({ kind: "project", id });
      return true;
    }} />}
  </section>;
}

function WorkspaceDialog({ dialog, state, onClose, onCreate, onMove }: { dialog: Dialog; state: SessionWorkspace; onClose: () => void; onCreate: (name: string) => boolean; onMove: (ids: string[], project: string | null, group: string | null) => boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const first = dialog.kind === "move" ? state.assignments[dialog.ids[0]] : undefined;
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(first?.projectId ?? "");
  const [groupId, setGroupId] = useState(dialog.kind === "move" && dialog.ids.every(id => state.assignments[id]?.projectId === first?.projectId && state.assignments[id]?.groupId === first?.groupId) ? first?.groupId ?? "" : "");
  const [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try { if (dialog.kind === "move" ? onMove(dialog.ids, projectId || null, projectId ? groupId || null : null) : onCreate(name)) onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save changes."); }
  };
  return <dialog className="sw-dialog" ref={ref} onClose={onClose} aria-labelledby="sw-dialog-title"><form onSubmit={submit}>
    <h2 id="sw-dialog-title">{dialog.kind === "move" ? "Move sessions" : dialog.kind === "group" ? "New group" : "New project"}</h2>
    {dialog.kind === "move" ? <><label htmlFor="sw-destination">Project</label><select id="sw-destination" value={projectId} onChange={e => { setProjectId(e.target.value); setGroupId(""); }}><option value="">No project</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{projectId && <><label htmlFor="sw-destination-group">Group</label><select id="sw-destination-group" value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">Uncategorized</option>{state.projects.find(p => p.id === projectId)?.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></>}<p>Organization in KlipRun only. Original folders stay the same.</p></> : <><label htmlFor="sw-name">{dialog.kind === "group" ? "Group name" : "Project name"}</label><input autoFocus id="sw-name" required maxLength={60} autoComplete="off" value={name} onChange={e => { setName(e.target.value); setError(""); }} /></>}
    {error && <p role="alert" className="sw-dialog-error">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="sw-primary">{dialog.kind === "move" ? "Move sessions" : dialog.kind === "group" ? "Create group" : "Create project"}</button></footer>
  </form></dialog>;
}
