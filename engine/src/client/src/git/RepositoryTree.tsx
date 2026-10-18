import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Braces, ChevronDown, ChevronRight, ChevronsDownUp, Code2, Database, FileCode2, FileText, Folder, FolderOpen, Notebook, Search, X } from "lucide-react";
import "./repositoryTree.css";
import { RepositoryFileMenu } from "./RepositoryFileMenu";
import { loadRepositoryWorkspace, saveRepositoryWorkspace } from "./workspaceState";

type Node = { name: string; path: string; children?: Node[]; status?: string };
type Row = { node: Node; depth: number; parent: string | null; position: number; siblings: number };
const compareNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function gitStatus(value = "") {
  if (/U|AA|DD/.test(value)) return "conflict";
  if (/[MRCT]/.test(value)) return "modified";
  if (/[?A]/.test(value)) return "added";
  if (/D/.test(value)) return "deleted";
  return undefined;
}
function buildTree(files: string[], statuses: Record<string, string>): Node[] {
  const roots: Node[] = [];
  const paths = new Map<string, Node>();
  for (const path of files) {
    let children = roots;
    const parts = path.split("/");
    parts.forEach((name, index) => {
      const partial = parts.slice(0, index + 1).join("/");
      let node = paths.get(partial);
      if (!node) {
        node = { name, path: partial, ...(index < parts.length - 1 ? { children: [] } : {}) };
        children.push(node); paths.set(partial, node);
      }
      const status = gitStatus(statuses[path]);
      if (status && (!node.status || status === "conflict" || status === "modified" && node.status !== "conflict")) node.status = status;
      if (node.children) children = node.children;
    });
  }
  function compact(nodes: Node[]): Node[] {
    return nodes.map(node => {
      while (node.children?.length === 1 && node.children[0].children) {
        const child = node.children[0];
        node = { ...child, name: `${node.name} / ${child.name}`, status: node.status };
      }
      if (node.children) node.children = compact(node.children);
      return node;
    }).sort((a, b) => Number(!!b.children) - Number(!!a.children) || compareNames.compare(a.name, b.name));
  }
  return compact(roots);
}
function initialExpanded(tree: Node[], selected: string | null): Set<string> {
  const result = new Set(tree.filter(node => node.children).map(node => node.path));
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
export function RepositoryTree({ root, files, selected, onSelect, disabled, statuses = emptyStatuses, onMove, onRename, onIgnore, onError }: {
  root: string; files: string[]; selected: string | null; onSelect: (path: string, permanent?: boolean) => void; disabled: boolean; statuses?: Record<string, string>;
  onMove?: (path: string, destination: string) => void; onRename?: (path: string) => void; onIgnore?: (path: string) => void; onError?: (error: string) => void;
}) {
  const saved = useMemo(() => loadRepositoryWorkspace(root), [root]);
  const [filter, setFilter] = useState(saved.fileFilter);
  const tree = useMemo(() => buildTree(files, statuses), [files, statuses]);
  const [expanded, setExpanded] = useState(() => saved.expandedFiles === null ? initialExpanded(tree, selected) : new Set(saved.expandedFiles));
  const previousSelected = useRef(selected);
  const [focused, setFocused] = useState<string | null>(selected);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const filterInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  const dragged = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const query = filter.trim().toLowerCase();
  const filtered = useMemo(() => query ? buildTree(files.filter(path => path.toLowerCase().includes(query)), statuses) : tree, [files, statuses, tree, query]);
  useEffect(() => { saveRepositoryWorkspace(root, { expandedFiles: [...expanded], fileFilter: filter }); }, [root, expanded, filter]);
  useEffect(() => {
    if (selected === previousSelected.current) return;
    previousSelected.current = selected;
    if (!selected) return;
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
  const focusPath = rows.some(row => row.node.path === focused) ? focused : rows[0]?.node.path;
  function focus(path: string | undefined) {
    if (!path) return;
    setFocused(path); buttons.current.get(path)?.focus();
  }
  function toggle(path: string) { setExpanded(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; }); }
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
    <div className={`repository-browser-heading${dropTarget === "" ? " is-drop-target" : ""}`} onDragOver={event => dragOver(event, "")} onDragLeave={() => setDropTarget(null)} onDrop={event => drop(event, "")} title="Drop here to move to the repository root"><FolderOpen size={15} aria-hidden="true" /><strong title={root}>{root.split("/").filter(Boolean).at(-1) ?? root}</strong><button type="button" aria-label="Collapse all folders" title="Collapse all folders" onClick={() => { setFilter(""); setExpanded(new Set()); setFocused(null); }}><ChevronsDownUp size={14} /></button></div>
    <div className="repository-browser-filter"><Search size={13} aria-hidden="true" /><input ref={filterInput} aria-label="Filter files" placeholder="Filter files…" value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setFilter(""); if (event.key === "ArrowDown") { event.preventDefault(); focus(rows[0]?.node.path); } }} />{filter && <button type="button" aria-label="Clear file filter" onClick={() => { setFilter(""); filterInput.current?.focus(); }}><X size={13} /></button>}</div>
    <div className="repository-browser-tree" role="tree" aria-label="Repository files">
      {rows.map((row, index) => {
        const { node, depth } = row, isFolder = !!node.children, isExpanded = !!query || expanded.has(node.path);
        return <button key={node.path} ref={element => { if (element) buttons.current.set(node.path, element); else buttons.current.delete(node.path); }} type="button" role="treeitem" className={`repository-browser-row${selected === node.path ? " is-selected" : ""}${dropTarget === node.path ? " is-drop-target" : ""}`} style={{ paddingLeft: 8 + depth * 20 }} title={node.path} aria-label={isFolder ? node.name : `Open file ${node.path}`} aria-selected={selected === node.path} aria-level={depth + 1} aria-posinset={row.position} aria-setsize={row.siblings} aria-expanded={isFolder ? isExpanded : undefined} tabIndex={node.path === focusPath ? 0 : -1} disabled={!isFolder && disabled} data-git-status={node.status} onFocus={() => setFocused(node.path)} onKeyDown={event => handleKey(event, row, index)} onClick={() => isFolder ? toggle(node.path) : onSelect(node.path, false)} onDoubleClick={() => { if (!isFolder) onSelect(node.path, true); }} onAuxClick={event => { if (!isFolder && event.button === 1 && !disabled) { event.preventDefault(); onSelect(node.path, true); } }}
          onContextMenu={event => { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); showMenu(node, event.clientX, event.clientY); }} draggable={!!onMove && !disabled}
          onDragStart={event => { setMenu(null); dragged.current = node.path; event.dataTransfer.setData("application/x-kliprun-file", node.path); event.dataTransfer.setData("text/plain", `${root}/${node.path}`); event.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { dragged.current = null; setDropTarget(null); }} onDragOver={isFolder ? event => dragOver(event, node.path) : undefined} onDragLeave={() => setDropTarget(null)} onDrop={isFolder ? event => drop(event, node.path) : undefined}>
          {depth > 0 && <span className="repository-browser-guides" style={{ width: depth * 20 }} aria-hidden="true" />}
          {isFolder ? <><span className="repository-browser-chevron">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>{isExpanded ? <FolderOpen size={15} className="repository-folder-icon" /> : <Folder size={15} className="repository-folder-icon" />}</> : <><span className="repository-browser-chevron" /><FileIcon path={node.path} /></>}
          <span className="repository-browser-name">{node.name}</span>
        </button>;
      })}
      {!rows.length && <p className="repository-browser-empty">{query ? "No matching files." : "No files to show."}</p>}
    </div>
    {menu && <RepositoryFileMenu root={root} path={menu.node.path} folder={!!menu.node.children} expanded={expanded.has(menu.node.path)} x={menu.x} y={menu.y} disabled={disabled}
      onOpen={() => onSelect(menu.node.path, true)} onToggle={() => toggle(menu.node.path)} onRename={() => onRename?.(menu.node.path)} onIgnore={() => onIgnore?.(menu.node.path)} onError={error => onError?.(error)}
      onClose={restore => { setMenu(null); if (restore) buttons.current.get(menu.node.path)?.focus(); }} />}
  </div>;
}
