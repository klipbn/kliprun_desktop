import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, ChevronsDownUp, FileDiff, FileText, FolderOpen, GitBranch, GitCommitHorizontal, History, Loader2, Minus, RefreshCw, X } from "lucide-react";
import type { GitAction, GitCommit, GitCommitDetail, GitCommitFile, GitDiff, GitDiffMode, GitFileAction, GitFileList, GitHistory, GitStatus } from "@shared/git";
import { gitRepository, saveGitRepository, hasDesktopBridge, notifyNativeAction, observeNativeRepository } from "../nativeBridge";
import { Counts, FileTree } from "./FileTree";
import { isFileDirty } from "./fileTabs";
import { useFileTabs } from "./useFileTabs";
import { RepositoryTree } from "./RepositoryTree";
import { RepositoryFileEditor } from "./RepositoryFileEditor";
import { DiffView } from "./DiffView";
import { HistoryList } from "./HistoryList";
import { PanelHeightResizer } from "./PanelHeightResizer";
import { BranchPicker } from "./BranchPicker";
import { ChangeViewSettings } from "./ChangeViewSettings";
import { groupChangeFiles } from "./changeView";
import { hasRepositoryWorkspace, loadChangeView, saveChangeView, saveRepositoryWorkspace } from "./workspaceState";
import { useRepositoryWorkspace } from "./useRepositoryWorkspace";
import { resizedDetailsWidth } from "../components/detailsSizing";
import { RecentSessionFilter } from "../components/RecentSessionFilter";
import { gitRequest, useGitRequest } from "./useGitRequest";
import { loadGitRepositories } from "./repositoryDiscovery";
import "./git.css";

const commitDrafts = new Map<string, string>();
const PANEL_WIDTH_KEY = "kliprun.git.sidebar-width";
function nameOf(path: string) { return path.split("/").filter(Boolean).at(-1) ?? path; }
function endpoint(name: string, directory: string, parameters: Record<string, string> = {}) { return `/api/git/${name}?${new URLSearchParams({ directory, ...parameters })}`; }
type Selection = { path: string; mode: GitDiffMode; revision?: string };

export default function Git({ directories, sessionId, sessionDirectory }: { directories: string[]; sessionId: string | null; sessionDirectory: string | null }) {
  const [directory, setDirectory] = useState(() => sessionDirectory ?? (sessionId ? "" : gitRepository()) ?? "");
  const [followingSession, setFollowingSession] = useState(!!sessionId);
  const lastSession = useRef({ id: sessionId, directory: sessionDirectory });
  const [refresh, setRefresh] = useState(0);
  const [workspace, updateWorkspace] = useRepositoryWorkspace(directory);
  const tab = workspace.tab;
  const setTab = (tab: typeof workspace.tab) => updateWorkspace({ tab });
  const [changeView, setChangeView] = useState(loadChangeView);
  useEffect(() => { saveChangeView(changeView); }, [changeView]);
  const [panelWidth, setPanelWidth] = useState<number | null>(() => {
    try { const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY)); return saved >= 320 && saved <= 850 ? saved : null; }
    catch { return null; }
  });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ x: number; width: number } | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const sidebarContent = useRef<HTMLDivElement>(null);
  const commitMessage = useRef<HTMLTextAreaElement>(null);
  const commitFiles = useRef<HTMLElement>(null);
  const visibleWidth = resizedDetailsWidth(panelWidth ?? 320, 0, 0, viewportWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try { if (panelWidth === null) localStorage.removeItem(PANEL_WIDTH_KEY); else localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); }
    catch { /* storage unavailable */ }
  }, [panelWidth]);
  function stopResize() { resizeDrag.current = null; setResizing(false); }
  const [historySelection, setHistorySelection] = useState<Selection | null>(null);
  const [historyDiffClosed, setHistoryDiffClosed] = useState(false);
  const selection: Selection | null = tab === "history" ? historySelection : workspace.selection;
  const diffClosed = tab === "history" ? historyDiffClosed : workspace.diffClosed;
  function setSelection(value: Selection | null) {
    if (tab === "history") setHistorySelection(value);
    else updateWorkspace({ selection: value && value.mode !== "commit" ? { path: value.path, mode: value.mode } : null });
  }
  function setDiffClosed(value: boolean) {
    if (tab === "history") setHistoryDiffClosed(value);
    else updateWorkspace({ diffClosed: value });
  }
  const folderOpen = (key: string) => workspace.changeFolders[key] ?? workspace.changesDefaultOpen;
  function toggleChangeFolder(key: string, open: boolean) {
    updateWorkspace(previous => ({ changeFolders: { ...previous.changeFolders, [key]: open } }));
  }
  const documents = useFileTabs(directory, () => setRefresh(value => value + 1));
  const documentTabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === "files") documentTabs.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [documents.activeId, tab]);
  const activeDocument = documents.tabs.find(document => document.id === documents.activeId);
  const filePath = activeDocument?.path ?? null;
  const dirty = documents.tabs.some(isFileDirty);
  const savingFiles = documents.tabs.some(document => document.saving);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  useEffect(() => { if (renaming) { renameDialog.current?.showModal(); renameInput.current?.select(); } }, [renaming?.path]);
  const pendingNavigation = useRef<{ action: () => void; ids: number[] } | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDocuments, setPendingDocuments] = useState<string[]>([]);
  function navigate(action: () => void, ids = documents.tabs.map(document => document.id), closing = false) {
    if (busyRef.current || savingFiles) return;
    const unsaved = documents.tabs.filter(document => ids.includes(document.id) && isFileDirty(document));
    if (unsaved.length) {
      pendingNavigation.current = { action, ids: unsaved.map(document => document.id) };
      setPendingDocuments(unsaved.map(document => document.path)); setPendingClose(closing);
      discardDialog.current?.showModal();
    } else action();
  }
  async function finishNavigation(save: boolean) {
    const pending = pendingNavigation.current;
    if (!pending) return;
    if (save) {
      for (const id of pending.ids) if (!await documents.save(id)) {
        documents.activate(id); setTab("files");
        pendingNavigation.current = null; discardDialog.current?.close(); return;
      }
    } else documents.discard(pending.ids);
    pendingNavigation.current = null; discardDialog.current?.close(); pending.action();
  }
  function closeFile(id: number) { navigate(() => documents.close(id), [id], true); }
  function chooseTab(value: typeof tab) {
    if (value === tab) return;
    setTab(value);
  }
  function openFile(path: string, permanent = false) {
    if (busyRef.current) return;
    void documents.open(path, permanent);
  }
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const [commitHash, setCommitHash] = useState<string | null>(null);
  const [message, setMessage] = useState(() => commitDrafts.get(directory) ?? "");
  useEffect(() => { commitDrafts.set(directory, message); }, [directory, message]);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const workspaceBusy = !!busy || savingFiles;
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [manualDirectory, setManualDirectory] = useState("");
  const [showManualDirectory, setShowManualDirectory] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRows, setHistoryRows] = useState<{ scope: string; rows: GitCommit[] }>({ scope: "", rows: [] });
  const currentDirectory = useRef(directory); currentDirectory.current = directory;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const candidates = [...new Set([...directories, ...(directory ? [directory] : [])])].slice(0, 100).sort();
  const repositoryUrl = `/api/git/repositories?${new URLSearchParams(candidates.map(value => ["directory", value]))}`;
  const repositories = useGitRequest<{ repositories: string[] }>(repositoryUrl, refresh, 0, loadGitRepositories);
  const statusRequest = useGitRequest<GitStatus>(directory ? endpoint("status", directory) : null, refresh, busy ? 0 : 5000);
  const status = statusRequest.error ? null : statusRequest.data;
  useEffect(() => { if (tab === "files" && status) documents.refreshActive(); }, [statusRequest.data, tab, documents.activeId]);
  const filesRequest = useGitRequest<GitFileList>(directory && status && tab === "files" ? endpoint("files", directory) : null, refresh);
  const fileStatuses = useMemo(() => Object.fromEntries((status?.files ?? []).map(file => [file.path, `${file.index}${file.worktree}`])), [status?.files]);
  const activeRemote = status?.remote ?? "";
  const historyScope = `${directory}:${status?.head ?? ""}`;
  const historyRequest = useGitRequest<GitHistory>(directory && tab === "history" && status ? endpoint("history", directory, { skip: String(historyPage * 50), head: status.head ?? "" }) : null, refresh);
  const detailRequest = useGitRequest<GitCommitDetail>(directory && status && tab === "history" && commitHash ? endpoint("commit", directory, { revision: commitHash }) : null, refresh);
  const diffRequest = useGitRequest<GitDiff>(directory && status && selection ? endpoint("diff", directory, { path: selection.path, mode: selection.mode, ...(selection.revision ? { revision: selection.revision } : {}) }) : null, refresh, selection?.mode !== "commit" && !busy ? 5000 : 0);
  const history = historyRows.scope === historyScope ? historyRows.rows : [];
  const chosenCommit = history.find(commit => commit.hash === commitHash);
  const commitBody = detailRequest.data?.message.split("\n").slice(1).join("\n").trim();
  const availableRoots = [...new Set([...(repositories.data?.repositories ?? []), ...(directory ? [directory] : [])])];

  const groups = useMemo(() => {
    const files = status?.files ?? [];
    const convert = (group: "staged" | "unstaged", list: typeof files): GitCommitFile[] => list.map(file => ({ path: file.path, originalPath: file.originalPath, status: group === "staged" ? file.index : file.worktree, ...file[group] }));
    return [
      { name: "Staged", mode: "staged" as const, action: "unstage" as const, files: convert("staged", files.filter(file => file.index !== " " && file.index !== "?")) },
      { name: "Unstaged", mode: "unstaged" as const, action: "stage" as const, files: convert("unstaged", files.filter(file => file.worktree !== " " && file.worktree !== "?")) },
      { name: "Untracked", mode: "unstaged" as const, action: "stage" as const, files: convert("unstaged", files.filter(file => file.index === "?")) },
    ];
  }, [status]);
  const totals = groups.flatMap(group => group.files).reduce((sum, file) => ({ additions: sum.additions + (file.additions ?? 0), deletions: sum.deletions + (file.deletions ?? 0) }), { additions: 0, deletions: 0 });
  const changeEntries = useMemo(() => groups.flatMap(group => group.files.map(file => ({ ...file, mode: group.mode }))), [groups]);
  const displayGroups = useMemo(() => groupChangeFiles(changeEntries, changeView.groupBy), [changeEntries, changeView.groupBy]);
  const stagePaths = [...new Set(groups.slice(1).flatMap(group => group.files.map(file => file.path)))];

  function chooseRepository(value: string, remember = true, fromSession = false) {
    if (busyRef.current) return;
    navigate(() => {
      commitDrafts.set(directory, message); setMessage(commitDrafts.get(value) ?? "");
      if (!hasRepositoryWorkspace(value)) saveRepositoryWorkspace(value, { tab: fromSession ? "changes" : tab });
      setDirectory(value); setHistorySelection(null); setHistoryDiffClosed(false); setCommitHash(null); setHistoryPage(0);
      setFollowingSession(fromSession); setShowManualDirectory(false);
      setOperationError(null); setNotice(null);
      if (remember) saveGitRepository(value);
    });
  }
  const chooseRepositoryRef = useRef(chooseRepository); chooseRepositoryRef.current = chooseRepository;
  useEffect(() => observeNativeRepository(value => chooseRepositoryRef.current(value)), []);
  useEffect(() => {
    if (lastSession.current.id === sessionId && lastSession.current.directory === sessionDirectory) return;
    if (busyRef.current || savingFiles) return;
    lastSession.current = { id: sessionId, directory: sessionDirectory };
    chooseRepositoryRef.current(sessionDirectory ?? "", false, !!sessionId);
  }, [sessionId, sessionDirectory, busy, savingFiles]);
  useEffect(() => {
    if (!directory && !sessionId && repositories.data?.repositories[0]) chooseRepositoryRef.current(repositories.data.repositories[0], false);
  }, [directory, sessionId, repositories.data]);
  useEffect(() => {
    if (status && status.root !== directory && !busyRef.current) {
      setMessage(commitDrafts.get(status.root) ?? message);
      setDirectory(status.root);
      saveGitRepository(status.root);
    }
  }, [status, directory, message]);
  useEffect(() => {
    if (statusRequest.error) { setSelection(null); setCommitHash(null); return; }
    if (tab !== "changes" || !status || diffClosed) return;
    if (selection && groups.some(group => group.mode === selection.mode && group.files.some(file => file.path === selection.path))) return;
    const group = groups.find(group => group.files.length);
    setSelection(group ? { path: group.files[0].path, mode: group.mode } : null);
  }, [tab, status, statusRequest.error, groups, selection, diffClosed]);
  useEffect(() => { setHistoryPage(0); }, [historyScope]);
  useEffect(() => {
    if (!historyRequest.data) return;
    setHistoryRows(previous => ({ scope: historyScope, rows: historyPage && previous.scope === historyScope
      ? [...previous.rows, ...historyRequest.data!.commits.filter(commit => !previous.rows.some(row => row.hash === commit.hash))] : historyRequest.data!.commits }));
  }, [historyRequest.data, historyScope, historyPage]);
  useEffect(() => {
    if (tab !== "history" || diffClosed || selection || detailRequest.data?.hash !== commitHash) return;
    const first = detailRequest.data?.files[0];
    if (first && commitHash) setSelection({ path: first.path, mode: "commit", revision: commitHash });
  }, [tab, commitHash, detailRequest.data, diffClosed, selection]);

  function chooseCommit(hash: string) {
    setCommitHash(hash); setSelection(null); setDiffClosed(false);
  }

  async function execute(action: GitAction, label: string, expected = status ? { branch: status.branch, head: status.head } : undefined) {
    if (busyRef.current) return;
    const target = directory; busyRef.current = true; setBusy(label); setOperationError(null); setNotice(null);
    try {
      await gitRequest("/api/git/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory: target, ...action, expected }) });
      if (action.action === "commit") commitDrafts.delete(target);
      if (!mounted.current || currentDirectory.current !== target) return;
      if (action.action === "commit") setMessage("");
      if (action.action === "switch-branch" || action.action === "create-branch") { setSelection(null); setCommitHash(null); setHistoryPage(0); }
      if (!["fetch", "pull", "push"].includes(action.action)) setNotice({ message: `${label} completed.` });
    } catch (error) {
      if (mounted.current && currentDirectory.current === target) setOperationError(error instanceof Error ? error.message : "Git operation failed.");
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(null); setRefresh(value => value + 1); }
    }
  }
  function requestFileAction(action: GitFileAction) {
    const affected = documents.tabs.filter(document => document.path === action.path || document.path.startsWith(`${action.path}/`) || action.action === "ignore" && document.path === ".gitignore");
    navigate(() => void executeFileAction(action, affected.map(document => document.id)), affected.map(document => document.id));
  }
  async function executeFileAction(action: GitFileAction, affectedIds: number[]) {
    if (busyRef.current) return;
    const target = directory, activePath = activeDocument?.path;
    busyRef.current = true; setBusy(action.action === "move" ? "Moving" : "Updating .gitignore"); setOperationError(null); setNotice(null);
    try {
      await gitRequest("/api/git/file-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory: target, ...action }) });
      if (!mounted.current || currentDirectory.current !== target) return;
      affectedIds.forEach(id => documents.close(id));
      if (action.action === "move" && activePath && (activePath === action.path || activePath.startsWith(`${action.path}/`))) {
        void documents.open(action.destination + activePath.slice(action.path.length), true);
      }
      setNotice({ message: action.action === "move" ? "Moved successfully." : "Added to .gitignore. Already tracked files remain tracked." });
    } catch (error) {
      if (mounted.current && currentDirectory.current === target) setOperationError(error instanceof Error ? error.message : "File operation failed.");
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(null); setRefresh(value => value + 1); }
    }
  }
  const noRepository = statusRequest.error === "This directory is not a Git working tree.";
  const error = operationError ?? (noRepository ? null : statusRequest.error) ?? repositories.error;
  const selectedFiles = detailRequest.data?.files ?? [];
  const emptyState = statusRequest.error
    ? { title: "Repository unavailable", detail: "Choose another folder or refresh to try again." }
    : tab === "files" && status
    ? { title: "Select a file to open", detail: "Browse files in this repository. Edit text, preview documents, and save locally." }
    : tab === "history" && status
    ? { title: commitHash ? "Select a file to review its diff" : "Select a commit to review its diff", detail: "Choose a commit in History, then one of its files." }
    : status && status.files.length
    ? { title: "Select a file to review its diff", detail: "Choose a file in Changes to reopen its diff." }
    : status
    ? { title: "Working tree clean", detail: "No changes to review. Browse previous commits in History." }
    : directory
    ? { title: "Loading repository…", detail: "Reading the selected folder's Git changes." }
    : { title: "Choose a session or repository", detail: "Git follows the selected session's project. Choose Folder… opens another existing repository." };

  return <main className="git-workspace" data-testid="git-workspace">
    <div className="git-toolbar">
      <GitBranch size={14} className="git-toolbar-icon" aria-hidden="true" />
      <div className="git-repository-picker"><RecentSessionFilter
        name="Repository" value={directory} disabled={workspaceBusy} onChange={value => chooseRepository(value)} searchable placement="viewport" searchSubject="repositories"
        options={[...(!directory ? [{ value: "", label: "Choose a session or folder" }] : []), ...availableRoots.map(root => ({ value: root, label: noRepository && root === directory ? "No Git repository" : nameOf(root), path: root }))]} />
      </div>
      <button type="button" className="git-button git-toolbar-action" disabled={workspaceBusy} aria-label="Choose Folder…" title="Choose a repository folder" onClick={() => { if (hasDesktopBridge()) notifyNativeAction("open-repository"); else setShowManualDirectory(value => !value); }}><FolderOpen size={14} /></button>
      <button type="button" className="git-button git-refresh" disabled={workspaceBusy} onClick={() => setRefresh(value => value + 1)} title="Refresh repository" aria-label="Refresh repository"><RefreshCw size={14} className={statusRequest.pending ? "animate-spin" : ""} /></button>
    </div>
    {showManualDirectory && !hasDesktopBridge() && <form className="git-manual-path" onSubmit={event => { event.preventDefault(); if (manualDirectory.trim()) chooseRepository(manualDirectory.trim()); }}><input autoFocus id="git-manual-directory" aria-label="Repository directory" placeholder="Absolute path to an existing Git repository" value={manualDirectory} onChange={event => setManualDirectory(event.target.value)} /><button className="git-button" disabled={workspaceBusy || !manualDirectory.trim()}>Open</button></form>}
    {(error || busy) && <div className={`git-feedback ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>
      {busy ? <><Loader2 size={14} className="animate-spin" />{busy}…</> : error}
      {!busy && operationError && <button type="button" aria-label="Dismiss notification" onClick={() => setOperationError(null)}><X size={14} /></button>}
    </div>}
    {notice && <div className="git-toast" role="status"><Check size={14} /><span>{notice.message}</span></div>}
    <div className="git-layout" data-resizing={resizing} style={panelWidth === null ? undefined : { "--git-sidebar-width": `${panelWidth}px` } as CSSProperties}>
      <section className="git-diff-pane" aria-label={tab === "files" ? "File editor" : "Diff viewer"}>
        {tab === "files" && documents.tabs.length > 0 && <div ref={documentTabs} className="git-document-tabs" role="tablist" aria-label="Open files">
          {documents.tabs.map((document, index) => <div key={document.id} className={`git-document-tab ${document.id === documents.activeId ? "is-active" : ""} ${document.pinned ? "" : "is-preview"}`}>
            <button type="button" role="tab" id={`git-document-tab-${document.id}`} aria-controls={`git-document-panel-${document.id}`} aria-selected={document.id === documents.activeId} aria-label={document.path} title={`${document.path}${document.pinned ? "" : " · Preview — double-click to keep open"}`} tabIndex={document.id === documents.activeId ? 0 : -1} onClick={() => documents.activate(document.id)} onDoubleClick={() => documents.pin(document.id)} onKeyDown={event => {
              const next = event.key === "Home" ? 0 : event.key === "End" ? documents.tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % documents.tabs.length : event.key === "ArrowLeft" ? (index - 1 + documents.tabs.length) % documents.tabs.length : null;
              if (next === null) return;
              event.preventDefault(); documents.activate(documents.tabs[next].id);
              event.currentTarget.parentElement?.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
            }}>
              <FileText size={13} /><span>{nameOf(document.path)}</span>{isFileDirty(document) && <span className="git-document-dirty" aria-label="Unsaved changes" />}
            </button>
            <button type="button" className="git-document-close" aria-label={`Close ${document.path}`} title="Close file" disabled={document.saving} onClick={() => closeFile(document.id)}><X size={13} /></button>
          </div>)}
        </div>}
        {(tab !== "files" || !activeDocument) && <div className="git-diff-heading">{tab === "files" ? <FileText size={14} /> : <FileDiff size={16} />}<strong title={tab === "files" ? filePath ?? undefined : selection?.path}>{tab === "files" ? filePath?.split("/").join(" / ") ?? "Repository files" : selection?.path ?? "Review your changes"}</strong>
          {tab !== "files" && selection && <><span className="git-badge">{selection.mode === "commit" ? selection.revision?.slice(0, 7) : selection.mode === "staged" ? "Staged" : "Working tree"}</span>
            <button type="button" className="git-close-file" aria-label="Close diff" title="Close diff" disabled={workspaceBusy} onClick={() => { setSelection(null); setDiffClosed(true); }}><X size={16} /></button></>}
        </div>}
        {documents.tabs.map(document => <div key={document.id} id={`git-document-panel-${document.id}`} role="tabpanel" aria-labelledby={`git-document-tab-${document.id}`} className="git-document-view" hidden={tab !== "files" || document.id !== documents.activeId}>
          {document.loading ? <div className="git-empty"><Loader2 className="animate-spin" /><span>Loading file…</span></div>
            : document.file ? <RepositoryFileEditor path={document.path} directory={directory} head={status?.head} refresh={refresh} active={tab === "files" && document.id === documents.activeId} content={document.file.draft} savedContent={document.file.content} saving={document.saving || !!busy} error={document.error} savedAt={document.savedAt} onChange={content => documents.edit(document.id, content)} onSave={() => void documents.save(document.id)} />
            : <div className="git-empty" role="alert"><strong>Unable to open file</strong><span>{document.error}</span></div>}
        </div>)}
        {tab === "history" && commitHash && <div className="git-commit-detail" title="Changes compared with the first parent; initial commits show all added files."><GitCommitHorizontal size={14} /><div><strong>{chosenCommit?.subject ?? commitHash.slice(0, 7)}</strong><p><code title={commitHash}>{commitHash.slice(0, 7)}</code>{chosenCommit ? ` · ${chosenCommit.author} · ${new Date(chosenCommit.date).toLocaleString()}` : ""}</p>{commitBody && <details><summary>Commit message</summary><pre>{commitBody}</pre></details>}</div></div>}
        {noRepository ? <div className="git-empty"><div className="git-empty-icon"><FolderOpen size={32} strokeWidth={1.3} /></div><strong>No Git repository</strong><span>{followingSession ? "This session's folder is not a Git working tree." : "The selected folder is not a Git working tree."} Choose Folder… opens an existing repository. It does not create one.</span></div>
          : tab === "files" && activeDocument ? null
          : diffRequest.error ? <div className="git-empty" role="alert"><strong>Unable to load diff</strong><span>{diffRequest.error}</span></div>
          : selection ? diffRequest.data ? <DiffView diff={diffRequest.data} /> : <div className="git-empty"><Loader2 className="animate-spin" /><span>Loading diff…</span></div>
          : <div className="git-empty"><div className="git-empty-icon"><FileDiff size={32} strokeWidth={1.3} /></div><strong>{emptyState.title}</strong><span>{emptyState.detail}</span><div className="git-empty-hints"><span><span className="git-dot" />Changes</span><span><History size={13} />Commit history</span><span><GitBranch size={13} />Branches</span></div></div>}
      </section>
      <aside ref={sidebar} className="git-sidebar" aria-label="Repository files, changes and history">
        <div className="git-panel-resizer" role="separator" aria-label="Resize Git panel" aria-orientation="vertical" tabIndex={0}
          aria-valuemin={320} aria-valuemax={Math.max(320, Math.min(850, viewportWidth - 340))} aria-valuenow={Math.round(visibleWidth)}
          title="Drag to resize Git panel"
          onPointerDown={event => {
            if (event.button !== 0) return;
            resizeDrag.current = { x: event.clientX, width: sidebar.current?.getBoundingClientRect().width ?? visibleWidth };
            setResizing(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={event => {
            const drag = resizeDrag.current;
            if (drag) setPanelWidth(resizedDetailsWidth(drag.width, drag.x, event.clientX, window.innerWidth));
          }}
          onPointerUp={event => {
            stopResize();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }} onPointerCancel={stopResize} onLostPointerCapture={stopResize}
          onKeyDown={event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setPanelWidth(resizedDetailsWidth(sidebar.current?.getBoundingClientRect().width ?? visibleWidth, 0, event.key === "ArrowLeft" ? -20 : 20, window.innerWidth));
          }} />
        <div className="git-tabs" role="tablist" aria-label="Git view">
          <button id="git-files-tab" type="button" role="tab" aria-controls="git-sidebar-panel" aria-selected={tab === "files"} onClick={() => chooseTab("files")}><FolderOpen size={14} />Files</button>
          <button id="git-changes-tab" type="button" role="tab" aria-controls="git-sidebar-panel" aria-selected={tab === "changes"} onClick={() => chooseTab("changes")}><FileDiff size={14} />Changes{status && <span>{status.files.length}</span>}</button>
          <button id="git-history-tab" type="button" role="tab" aria-controls="git-sidebar-panel" aria-selected={tab === "history"} onClick={() => chooseTab("history")}><History size={14} />History</button>
        </div>
        {tab === "changes" && <div className="git-changes-summary">
          <span className="git-changes-count">{status?.files.length ?? 0} files</span><Counts {...totals} />
          <div className="git-changes-tools"><ChangeViewSettings preferences={changeView} onChange={setChangeView} />
            <button type="button" className="git-button git-view-settings-trigger" aria-label="Collapse all folders" title="Collapse all folders" disabled={!status?.files.length}
              onClick={() => updateWorkspace({ changesDefaultOpen: false, changeFolders: {} })}><ChevronsDownUp size={14} /></button>
            <button type="button" className="git-button" disabled={workspaceBusy || !stagePaths.length} onClick={() => void execute({ action: "stage", paths: stagePaths }, "Stage all")}>Stage all</button>
            <button type="button" className="git-button git-view-settings-trigger" aria-label="Unstage all" title="Unstage all" disabled={workspaceBusy || !groups[0].files.length}
              onClick={() => void execute({ action: "unstage", paths: groups[0].files.map(file => file.path) }, "Unstage all")}><Minus size={14} /></button>
          </div>
        </div>}
        <div ref={sidebarContent} id="git-sidebar-panel" className="git-sidebar-content" role="tabpanel" aria-labelledby={`git-${tab}-tab`}>
          {tab === "files" ? <>
            {filesRequest.error && <p className="git-notice" role="alert">{filesRequest.error}</p>}
            {filesRequest.pending && !filesRequest.data ? <p className="git-history-loading"><Loader2 size={14} className="animate-spin" />Loading files…</p>
              : filesRequest.data ? <RepositoryTree key={directory} root={directory} files={filesRequest.data.files} directories={filesRequest.data.directories} ignored={filesRequest.data.ignored} trackedDirectories={filesRequest.data.trackedDirectories} nextOffset={filesRequest.data.nextOffset} refresh={refresh} statuses={fileStatuses} selected={filePath} onSelect={openFile} disabled={workspaceBusy}
                onMove={(path, destination) => requestFileAction({ action: "move", path, destination })} onRename={path => setRenaming({ path, name: nameOf(path) })}
                onIgnore={path => requestFileAction({ action: "ignore", path })} onError={setOperationError} />
              : <div className="git-empty git-sidebar-empty"><FolderOpen size={26} /><strong>No files to display</strong><span>Choose a repository to browse its files.</span></div>}
          </> : tab === "changes" ? <>
            {displayGroups.map(group => {
              const tree = <FileTree files={group.files} selected={selection?.path ?? null} selectedMode={selection?.mode === "staged" ? "staged" : "unstaged"}
                disabled={workspaceBusy} view={changeView.view} sortBy={changeView.sortBy} showMode={changeView.groupBy !== "staged"}
                folderOpen={path => folderOpen(`${group.name ?? "all"}:${path}`)} onFolderToggle={(path, open) => toggleChangeFolder(`${group.name ?? "all"}:${path}`, open)}
                onSelect={(path, mode) => { setDiffClosed(false); setSelection({ path, mode: mode ?? "unstaged" }); }}
                onAction={(paths, mode) => void execute({ action: mode === "staged" ? "unstage" : "stage", paths }, mode === "staged" ? "Unstage" : "Stage")} />;
              if (!group.name) return <div key="all">{tree}</div>;
              const working = group.files.filter(file => file.mode === "unstaged"), staged = group.files.filter(file => file.mode === "staged");
              const key = `${group.name}:`;
              return <details className="git-file-group" key={group.name} open={folderOpen(key)} aria-label={`${group.name} changes`}
                onToggle={event => { if (event.currentTarget.open !== folderOpen(key)) toggleChangeFolder(key, event.currentTarget.open); }}>
                <summary><span>{group.name}<small>{group.files.length}</small></span><span className="git-group-actions">
                  {working.length > 0 && <button type="button" className="git-text-button" disabled={workspaceBusy} onClick={event => { event.preventDefault(); void execute({ action: "stage", paths: working.map(file => file.path) }, "Stage all"); }}>Stage all</button>}
                  {staged.length > 0 && <button type="button" className="git-text-button" disabled={workspaceBusy} onClick={event => { event.preventDefault(); void execute({ action: "unstage", paths: staged.map(file => file.path) }, "Unstage all"); }}>Unstage all</button>}
                </span></summary>{tree}
              </details>;
            })}
            {!status?.files.length && <div className="git-empty git-sidebar-empty">{statusRequest.pending && !status ? <Loader2 className="animate-spin" /> : <Check size={26} strokeWidth={1.4} />}<strong>{status ? "Working tree clean" : noRepository ? "No files to display" : statusRequest.error ? "Repository unavailable" : directory ? "Loading repository…" : "No repository selected"}</strong><span>{status ? "No changes to commit." : statusRequest.error ? "Choose a folder containing a Git repository." : "Choose a session or folder to get started."}</span></div>}
          </> : <>
            {historyRequest.error && <p className="git-notice" role="alert">{historyRequest.error}</p>}
            <HistoryList key={directory} commits={history} selected={commitHash} onSelect={chooseCommit} />
            {historyRequest.pending && <p className="git-history-loading"><Loader2 size={14} className="animate-spin" />Loading history…</p>}
            {!history.length && !historyRequest.pending && <div className="git-empty git-sidebar-empty"><History size={26} /><strong>{status?.unborn ? "No commits yet" : "No history to display"}</strong><span>{status?.unborn ? "Stage your changes and create the first commit." : "Choose a repository to browse its commits."}</span></div>}
            {historyRequest.data?.hasMore && <button type="button" className="git-button git-load-more" disabled={historyRequest.pending} onClick={() => setHistoryPage(value => value + 1)}>Load older commits</button>}
          </>}
        </div>
        {tab === "history" && commitHash && <>
          <PanelHeightResizer label="Resize changed files" storageKey="kliprun.git.changed-files-height" minimum={64} target={commitFiles} remaining={sidebarContent} container={sidebar} />
          <section ref={commitFiles} className="git-commit-files"><h3 title={`Files in ${commitHash}`}>Changed files<small>{selectedFiles.length}</small></h3>
          {detailRequest.error && <p className="git-notice" role="alert">{detailRequest.error}</p>}
          <FileTree files={selectedFiles} selected={selection?.path ?? null} disabled={workspaceBusy} view="list" onSelect={path => { setDiffClosed(false); setSelection({ path, mode: "commit", revision: commitHash }); }} />
        </section></>}

        <div className="git-remote-controls">
          <BranchPicker key={directory} status={status} disabled={workspaceBusy}
            onSwitch={branch => navigate(() => { documents.clear(); void execute({ action: "switch-branch", branch }, "Switch branch"); })}
            onCreate={branch => navigate(() => { documents.clear(); void execute({ action: "create-branch", branch }, "Create branch"); })} />
          <button type="button" className="git-button" disabled={workspaceBusy || !status?.remotes.length} onClick={() => void execute({ action: "fetch", remote: activeRemote }, "Fetch")}><RefreshCw size={13} />Fetch</button>
          <button type="button" className="git-button" disabled={workspaceBusy || !status?.upstream || !status?.branch} onClick={() => navigate(() => { documents.clear(); void execute({ action: "pull" }, "Pull"); })}><ArrowDown size={13} />Pull</button>
          <button type="button" className="git-button" disabled={workspaceBusy || !status?.remotes.length || !status.branch || status.unborn} onClick={() => void execute({ action: "push", remote: activeRemote }, status?.upstream ? "Push" : "Publish branch")}><ArrowUp size={13} />{status?.upstream ? "Push" : "Publish"}</button>
        </div>
        {tab === "changes" && <>
          <PanelHeightResizer label="Resize commit message" storageKey="kliprun.git.commit-height" minimum={48} target={commitMessage} remaining={sidebarContent} container={sidebar} />
          <form className="git-commit-form" onSubmit={event => { event.preventDefault(); if (status && groups[0].files.length && message.trim()) void execute({ action: "commit", message }, "Commit"); }}>
          <textarea ref={commitMessage} aria-label="Commit message" placeholder="Commit message" value={message} disabled={workspaceBusy || !status} onChange={event => setMessage(event.target.value)} rows={3} maxLength={20_000} />
          <div><span>{groups[0].files.length} staged</span><button className="git-button git-primary" disabled={workspaceBusy || !groups[0].files.length || !message.trim()}><GitCommitHorizontal size={14} />Commit staged</button></div>
        </form></>}
      </aside>
    </div>

    <dialog ref={renameDialog} className="git-discard-dialog" aria-labelledby="git-rename-title" onClose={() => setRenaming(null)}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!renaming || !renaming.name || /[\/\0]/.test(renaming.name) || [".", ".."].includes(renaming.name)) return;
        const parent = renaming.path.split("/").slice(0, -1).join("/");
        renameDialog.current?.close();
        requestFileAction({ action: "move", path: renaming.path, destination: `${parent ? `${parent}/` : ""}${renaming.name}` });
      }}>
        <h2 id="git-rename-title">Rename file or folder</h2>
        <label htmlFor="git-rename-name">New name</label>
        <input ref={renameInput} id="git-rename-name" className="git-rename-input" value={renaming?.name ?? ""} required maxLength={255} onChange={event => setRenaming(value => value ? { ...value, name: event.target.value } : null)} />
        <div><button type="button" className="git-button" onClick={() => renameDialog.current?.close()}>Cancel</button><button type="submit" className="git-button git-primary" disabled={!renaming?.name || renaming.name === nameOf(renaming.path) || /[\/\0]/.test(renaming.name) || [".", ".."].includes(renaming.name)}>Rename</button></div>
      </form>
    </dialog>
    <dialog ref={discardDialog} className="git-discard-dialog" aria-labelledby="git-discard-title" onCancel={event => { if (savingFiles) event.preventDefault(); else pendingNavigation.current = null; }}>
      <h2 id="git-discard-title">Save unsaved changes?</h2><p>{pendingDocuments.length === 1 ? `Your edits to ${pendingDocuments[0]} have not been saved.` : `${pendingDocuments.length} files have unsaved edits.`}</p>
      {pendingDocuments.length > 1 && <ul>{pendingDocuments.map(path => <li key={path}>{path}</li>)}</ul>}
      <div><button type="button" className="git-button" autoFocus disabled={savingFiles} onClick={() => { pendingNavigation.current = null; discardDialog.current?.close(); }}>Keep editing</button>
        <button type="button" className="git-button git-discard-button" disabled={savingFiles} onClick={() => void finishNavigation(false)}>Discard changes</button>
        <button type="button" className="git-button git-primary" disabled={savingFiles} onClick={() => void finishNavigation(true)}>{savingFiles ? "Saving…" : pendingClose ? "Save and close" : "Save changes"}</button></div>
    </dialog>
  </main>;
}
