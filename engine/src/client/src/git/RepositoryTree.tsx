import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Braces, ChevronDown, ChevronRight, ChevronsDownUp, Code2, Database, Eye, EyeOff, FileCode2, FileText, Folder, FolderOpen, Loader2, Notebook, Search, X } from "lucide-react";
import type { GitFileList } from "@shared/git";
import "./repositoryTree.css";
import { RepositoryFileMenu } from "./RepositoryFileMenu";
import { loadRepositoryWorkspace, saveRepositoryWorkspace } from "./workspaceState";
import { gitRequest } from "./useGitRequest";

type Node = { name: string; path: string; children?: Node[]; status?: string; ignored: boolean };
type Row = { node: Node; depth: number; parent: string | null; position: number; siblings: number };
const compareNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function gitStatus(value = "") {
  if (/U|AA|DD/.test(value)) return "conflict";
  if (/[MRCT]/.test(value)) return "modified";
  if (/[?A]/.test(value)) return "added";
  if (/D/.test(value)) return "deleted";
  return undefined;
}
function buildTree(files: string[], statuses: Record<string, string>, directories: string[] = [], ignored = new Set<string>()): Node[] {
  const roots: Node[] = [];
  const paths = new Map<string, Node>();
  const folders = new Set(directories);
  for (const path of [...directories, ...files]) {
    let children = roots;
    const parts = path.split("/");
    parts.forEach((name, index) => {
      const partial = parts.slice(0, index + 1).join("/");
      let node = paths.get(partial);
      if (!node) {
        node = { name, path: partial, ignored: ignored.has(partial), ...(index < parts.length - 1 || folders.has(partial) ? { children: [] } : {}) };
        children.push(node); paths.set(partial, node);
      }
      if (node.children) children = node.children;
    });
  }
  for (const [path, value] of Object.entries(statuses)) {
    const parts = path.split("/"), status = gitStatus(value);
    for (let i = 1; status && i <= parts.length; i++) {
      const node = paths.get(parts.slice(0, i).join("/"));
      if (node && (!node.status || status === "conflict" || status === "modified" && node.status !== "conflict")) node.status = status;
    }
  }
  function compact(nodes: Node[]): Node[] {
    return nodes.map(node => {
      while (!folders.has(node.path) && !node.ignored && node.children?.length === 1 && node.children[0].children && !node.children[0].ignored) {
        const child = node.children[0];
        node = { ...child, name: `${node.name} / ${child.name}`, status: node.status };
      }
      if (node.children) node.children = compact(node.children);
      return node;
    }).sort((a, b) => Number(!!b.children) - Number(!!a.children) || compareNames.compare(a.name, b.name));
  }
  return compact(roots);
}
function initialExpanded(tree: Node[], selected: string | null, directories: string[]): Set<string> {
  const result = new Set(tree.filter(node => node.children && !node.ignored && !directories.includes(node.path)).map(node => node.path));
  const parts = selected?.split("/") ?? [];
  for (let i = 1; i < parts.length; i++) result.add(parts.slice(0, i).join("/"));
  function reveal(nodes: Node[]) { for (const node of nodes) if (node.children && selected?.startsWith(`${node.path}/`)) { result.add(node.path); reveal(node.children); } }
  reveal(tree);
  return result;
}
function FileIcon({ path }: { path: string }) {
  const extension = path.split(".").pop()?.toLowerCase();
  const kind = extension === "ipynb" ? "notebook" : extension === "py" || extension === "pyi" ? "python" : extension === "sql" ? "sql" : extension === "md" || extension === "mdx" ? "markdown" : /^(js|jsx|mjs|cjs)$/.test(extension ?? "") ? "javascript" : /^(ts|tsx)$/.test(extension ?? "") ? "typescript" : extension === "json" || extension === "jsonc" ? "json" : "text";
  const Icon = kind === "notebook" ? Notebook : kind === "sql" ? Database : kind === "json" ? Braces : kind === "markdown" || kind === "text" ? FileText : kind === "python" ? Code2 : FileCode2;
  return <Icon size={15} className={`repository-file-icon is-${kind}`} aria-hidden="true" />;
}
const emptyStatuses: Record<string, string> = {};
const emptyPaths: string[] = [];
function appendList(previous: GitFileList | undefined | null, next: GitFileList): GitFileList {
  if (!previous) return next;
  return { ...next, files: [...new Set([...previous.files, ...next.files])],
    directories: [...new Set([...(previous.directories ?? []), ...(next.directories ?? [])])],
    ignored: [...new Set([...(previous.ignored ?? []), ...(next.ignored ?? [])])],
    trackedDirectories: [...new Set([...(previous.trackedDirectories ?? []), ...(next.trackedDirectories ?? [])])] };
}
export function RepositoryTree({ root, files, directories = emptyPaths, ignored = emptyPaths, trackedDirectories = emptyPaths, nextOffset, refresh = 0, selected, onSelect, disabled, statuses = emptyStatuses, onMove, onRename, onIgnore, onError }: {
  root: string; files: string[]; selected: string | null; onSelect: (path: string, permanent?: boolean) => void; disabled: boolean; statuses?: Record<string, string>;
  directories?: string[]; ignored?: string[]; trackedDirectories?: string[]; nextOffset?: number; refresh?: number;
  onMove?: (path: string, destination: string) => void; onRename?: (path: string) => void; onIgnore?: (path: string) => void; onError?: (error: string) => void;
}) {
  const saved = useMemo(() => loadRepositoryWorkspace(root), [root]);
  const [filter, setFilter] = useState(saved.fileFilter);
  const [showIgnored, setShowIgnored] = useState(saved.showIgnoredFiles);
  const [loaded, setLoaded] = useState<{ refresh: number; entries: Record<string, GitFileList> }>({ refresh, entries: {} });
  const [loading, setLoading] = useState(new Set<string>());
  const requests = useRef(new Map<string, AbortController>()), cache = useRef(new Map<string, GitFileList>()), failed = useRef(new Set<string>());
  const loadedLists = useMemo(() => loaded.refresh === refresh ? Object.values(loaded.entries) : [], [loaded, refresh]);
  const allFiles = useMemo(() => [...new Set([...files, ...loadedLists.flatMap(list => list.files)])], [files, loadedLists]);
  const selectedDirectories = useMemo(() => {
    if (!selected || allFiles.includes(selected)) return [];
    const parts = selected.split("/");
    return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"));
  }, [selected, allFiles]);
  const allDirectories = useMemo(() => [...new Set([...directories, ...loadedLists.flatMap(list => list.directories ?? []), ...selectedDirectories])], [directories, loadedLists, selectedDirectories]);
  const allIgnored = useMemo(() => new Set([...ignored, ...loadedLists.flatMap(list => list.ignored ?? [])]), [ignored, loadedLists]);
  const allTrackedDirectories = useMemo(() => new Set([...trackedDirectories, ...loadedLists.flatMap(list => list.trackedDirectories ?? [])]), [trackedDirectories, loadedLists]);
  const visibleFiles = useMemo(() => showIgnored ? allFiles : allFiles.filter(path => !allIgnored.has(path)), [allFiles, allIgnored, showIgnored]);
  const visibleDirectories = useMemo(() => showIgnored ? allDirectories : allDirectories.filter(path => !allIgnored.has(path) || allTrackedDirectories.has(path) || visibleFiles.some(file => file.startsWith(`${path}/`))), [allDirectories, allIgnored, allTrackedDirectories, visibleFiles, showIgnored]);
  const tree = useMemo(() => buildTree(visibleFiles, statuses, visibleDirectories, allIgnored), [visibleFiles, statuses, visibleDirectories, allIgnored]);
  const [expanded, setExpanded] = useState(() => saved.expandedFiles === null ? initialExpanded(tree, selected, directories) : new Set(saved.expandedFiles));
  const previousSelected = useRef(selected);
  const [focused, setFocused] = useState<string | null>(selected);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const filterInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  const dragged = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const query = filter.trim().toLowerCase();
  const [search, setSearch] = useState<{ query: string; data: GitFileList | null; pending: boolean; error: string | null }>({ query: "", data: null, pending: false, error: null });
  const searchController = useRef<AbortController | null>(null);
  const searchData = search.query === query ? search.data : null;
  const filtered = useMemo(() => query ? buildTree(searchData?.files ?? [], statuses, searchData?.directories ?? [], new Set([...allIgnored, ...(searchData?.ignored ?? [])])) : tree, [searchData, allIgnored, statuses, tree, query]);
  useEffect(() => {
    if (!query) return;
    setSearch({ query, data: null, pending: true, error: null });
    const timer = window.setTimeout(() => void loadSearch(), 250);
    return () => { window.clearTimeout(timer); searchController.current?.abort(); };
  }, [root, query, refresh, showIgnored]);
  async function loadSearch(offset = 0) {
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setSearch(previous => ({ query, data: offset && previous.query === query ? previous.data : null, pending: true, error: null }));
    try {
      const list = await gitRequest<GitFileList>(`/api/git/files?${new URLSearchParams({ directory: root, search: query, includeIgnored: String(showIgnored), offset: String(offset) })}`, { signal: controller.signal });
      if (!controller.signal.aborted) setSearch(previous => ({ query, data: appendList(offset ? previous.data : null, list), pending: false, error: null }));
    } catch (error) {
      if (!controller.signal.aborted) setSearch(previous => ({ ...previous, pending: false, error: error instanceof Error ? error.message : "Unable to search repository." }));
    }
  }
  useEffect(() => { saveRepositoryWorkspace(root, { expandedFiles: [...expanded], fileFilter: filter, showIgnoredFiles: showIgnored }); }, [root, expanded, filter, showIgnored]);
  useEffect(() => {
    cache.current.clear(); failed.current.clear(); setLoaded({ refresh, entries: {} }); setLoading(new Set());
    return () => { for (const controller of requests.current.values()) controller.abort(); requests.current.clear(); };
  }, [root, refresh]);
  useEffect(() => {
    if (query) return;
    for (const path of visibleDirectories) if (expanded.has(path) && !cache.current.has(path) && !requests.current.has(path) && !failed.current.has(path)) void loadDirectory(path);
  }, [root, refresh, visibleDirectories, expanded, query]);
  async function loadDirectory(path: string, offset = 0) {
    if (requests.current.has(path)) return;
    const controller = new AbortController(); requests.current.set(path, controller);
    setLoading(previous => new Set([...previous, path]));
    try {
      const list = await gitRequest<GitFileList>(`/api/git/files?${new URLSearchParams({ directory: root, ...(path ? { path } : {}), offset: String(offset) })}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      cache.current.set(path, appendList(offset ? cache.current.get(path) : null, list)); setLoaded({ refresh, entries: Object.fromEntries(cache.current) });
    } catch (error) {
      if (!controller.signal.aborted) { failed.current.add(path); onError?.(error instanceof Error ? error.message : "Unable to load folder. Collapse and expand it to retry."); }
    } finally {
      if (requests.current.get(path) === controller) {
        requests.current.delete(path);
        setLoading(previous => { const next = new Set(previous); next.delete(path); return next; });
      }
    }
  }
  useEffect(() => {
    if (selected === previousSelected.current) return;
    previousSelected.current = selected;
    if (!selected) return;
    if (allIgnored.has(selected)) setShowIgnored(true);
    if (filter && !selected.toLowerCase().includes(filter.trim().toLowerCase())) setFilter("");
    setExpanded(previous => {
      const next = new Set(previous), parts = selected.split("/");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
    setFocused(selected);
    const frame = requestAnimationFrame(() => buttons.current.get(selected)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [selected, root]);
  const rows: Row[] = [];
  function flatten(nodes: Node[], depth = 0, parent: string | null = null) {
    nodes.forEach((node, index) => {
      rows.push({ node, depth, parent, position: index + 1, siblings: nodes.length });
      if (node.children && (query || expanded.has(node.path))) flatten(node.children, depth + 1, node.path);
    });
  }
  flatten(filtered);
  const pages = query ? [] : [
    { path: "", offset: loaded.refresh === refresh && loaded.entries[""] ? loaded.entries[""].nextOffset : nextOffset },
    ...Object.entries(loaded.refresh === refresh ? loaded.entries : {}).filter(([path]) => path && expanded.has(path) && rows.some(row => row.node.path === path)).map(([path, list]) => ({ path, offset: list.nextOffset })),
  ].filter(page => page.offset !== undefined);
  const focusPath = rows.some(row => row.node.path === focused) ? focused : rows[0]?.node.path;
  function focus(path: string | undefined) {
    if (!path) return;
    setFocused(path); buttons.current.get(path)?.focus();
  }
  function toggle(path: string) { failed.current.delete(path); setExpanded(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; }); }
  function showMenu(node: Node, x: number, y: number) { setFocused(node.path); setMenu({ node, x, y }); }
  function destination(folder: string) {
    const source = dragged.current;
    if (!source || disabled || !onMove || folder === source || folder.startsWith(`${source}/`)) return null;
    const target = `${folder ? `${folder}/` : ""}${source.split("/").at(-1)}`;
    return target === source ? null : target;
  }
  function dragOver(event: DragEvent, folder: string) {
    if (!destination(folder)) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setDropTarget(folder);
  }
  function drop(event: DragEvent, folder: string) {
    const target = destination(folder), source = dragged.current;
    event.preventDefault(); event.stopPropagation(); dragged.current = null; setDropTarget(null);
    if (target && source) { setExpanded(previous => new Set([...previous, folder, target])); onMove?.(source, target); }
  }
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, row: Row, index: number) {
    const { node } = row;
    if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
      event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showMenu(node, rect.left + 20, rect.bottom); return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    switch (event.key) {
      case "ArrowUp": focus(rows[Math.max(0, index - 1)]?.node.path); break;
      case "ArrowDown": focus(rows[Math.min(rows.length - 1, index + 1)]?.node.path); break;
      case "Home": focus(rows[0]?.node.path); break;
      case "End": focus(rows.at(-1)?.node.path); break;
      case "ArrowRight":
        if (node.children) { if (!query && !expanded.has(node.path)) toggle(node.path); else focus(rows[index + 1]?.node.path); }
        break;
      case "ArrowLeft":
        if (node.children && expanded.has(node.path) && !query) toggle(node.path); else focus(row.parent ?? undefined);
        break;
      case "Enter": case " ": if (node.children) toggle(node.path); else if (!disabled) onSelect(node.path, event.key === "Enter"); break;
    }
  }
  return <div className="repository-browser">
    <div className={`repository-browser-heading${dropTarget === "" ? " is-drop-target" : ""}`} onDragOver={event => dragOver(event, "")} onDragLeave={() => setDropTarget(null)} onDrop={event => drop(event, "")} title="Drop here to move to the repository root"><FolderOpen size={15} aria-hidden="true" /><strong title={root}>{root.split("/").filter(Boolean).at(-1) ?? root}</strong><button type="button" aria-label={showIgnored ? "Hide ignored files" : "Show ignored files"} title={showIgnored ? "Hide ignored files" : "Show ignored files"} aria-pressed={showIgnored} onClick={() => setShowIgnored(value => !value)}>{showIgnored ? <Eye size={14} /> : <EyeOff size={14} />}</button><button type="button" aria-label="Collapse all folders" title="Collapse all folders" onClick={() => { setFilter(""); setExpanded(new Set()); setFocused(null); }}><ChevronsDownUp size={14} /></button></div>
    <div className="repository-browser-filter"><Search size={13} aria-hidden="true" /><input ref={filterInput} aria-label="Filter files" placeholder="Filter files…" value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setFilter(""); if (event.key === "ArrowDown") { event.preventDefault(); focus(rows[0]?.node.path); } }} />{filter && <button type="button" aria-label="Clear file filter" onClick={() => { setFilter(""); filterInput.current?.focus(); }}><X size={13} /></button>}</div>
    <div className="repository-browser-tree" role="tree" aria-label="Repository files">
      {rows.map((row, index) => {
        const { node, depth } = row, isFolder = !!node.children, isExpanded = !!query || expanded.has(node.path);
        return <button key={node.path} ref={element => { if (element) buttons.current.set(node.path, element); else buttons.current.delete(node.path); }} type="button" role="treeitem" className={`repository-browser-row${selected === node.path ? " is-selected" : ""}${dropTarget === node.path ? " is-drop-target" : ""}`} style={{ paddingLeft: 8 + depth * 20 }} title={`${node.path}${node.ignored ? " · Ignored by Git" : ""}`} aria-label={isFolder ? node.name : `Open file ${node.path}`} aria-selected={selected === node.path} aria-level={depth + 1} aria-posinset={row.position} aria-setsize={row.siblings} aria-expanded={isFolder ? isExpanded : undefined} aria-busy={loading.has(node.path) || undefined} tabIndex={node.path === focusPath ? 0 : -1} disabled={!isFolder && disabled} data-git-status={node.status} data-git-ignored={node.ignored || undefined} onFocus={() => setFocused(node.path)} onKeyDown={event => handleKey(event, row, index)} onClick={() => isFolder ? toggle(node.path) : onSelect(node.path, false)} onDoubleClick={() => { if (!isFolder) onSelect(node.path, true); }} onAuxClick={event => { if (!isFolder && event.button === 1 && !disabled) { event.preventDefault(); onSelect(node.path, true); } }}
          onContextMenu={event => { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); showMenu(node, event.clientX, event.clientY); }} draggable={!!onMove && !disabled}
          onDragStart={event => { setMenu(null); dragged.current = node.path; event.dataTransfer.setData("application/x-kliprun-file", node.path); event.dataTransfer.setData("text/plain", `${root}/${node.path}`); event.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { dragged.current = null; setDropTarget(null); }} onDragOver={isFolder ? event => dragOver(event, node.path) : undefined} onDragLeave={() => setDropTarget(null)} onDrop={isFolder ? event => drop(event, node.path) : undefined}>
          {depth > 0 && <span className="repository-browser-guides" style={{ width: depth * 20 }} aria-hidden="true" />}
          {isFolder ? <><span className="repository-browser-chevron">{loading.has(node.path) ? <Loader2 size={12} className="animate-spin" /> : isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>{isExpanded ? <FolderOpen size={15} className="repository-folder-icon" /> : <Folder size={15} className="repository-folder-icon" />}</> : <><span className="repository-browser-chevron" /><FileIcon path={node.path} /></>}
          <span className="repository-browser-name">{node.name}</span>
        </button>;
      })}
      {!rows.length && <p className="repository-browser-empty" role="status">{query ? search.pending || search.query !== query ? "Searching repository…" : search.error ? "Search unavailable." : "No matching files." : "No files to show."}</p>}
    </div>
    {query && search.error && <p className="repository-browser-empty" role="alert">{search.error}<button type="button" className="git-button" onClick={() => void loadSearch()}>Retry search</button></p>}
    {query && searchData?.nextOffset !== undefined && <button type="button" className="repository-browser-more" disabled={search.pending} onClick={() => void loadSearch(searchData.nextOffset)}>Load more search results</button>}
    {pages.map(page => <button key={page.path} type="button" className="repository-browser-more" aria-label={page.path ? `Load more in ${page.path}` : "Load more repository files"} disabled={loading.has(page.path)} onClick={() => void loadDirectory(page.path, page.offset)}>{loading.has(page.path) ? "Loading…" : page.path ? `Load more in ${page.path}` : "Load more files"}</button>)}
    {menu && <RepositoryFileMenu root={root} path={menu.node.path} folder={!!menu.node.children} expanded={expanded.has(menu.node.path)} x={menu.x} y={menu.y} disabled={disabled}
      onOpen={() => onSelect(menu.node.path, true)} onToggle={() => toggle(menu.node.path)} onRename={() => onRename?.(menu.node.path)} onIgnore={() => onIgnore?.(menu.node.path)} onError={error => onError?.(error)}
      onClose={restore => { setMenu(null); if (restore) buttons.current.get(menu.node.path)?.focus(); }} />}
  </div>;
}
