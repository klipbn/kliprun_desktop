import { CHANGE_VIEW_KEY, readChangeView, type ChangeViewPreferences } from "./changeView";

export type ChangeSelection = { path: string; mode: "staged" | "unstaged" };
export interface RepositoryWorkspace {
  tab: "files" | "changes" | "history";
  selection: ChangeSelection | null;
  diffClosed: boolean;
  changeFolders: Record<string, boolean>;
  changesDefaultOpen: boolean;
  expandedFiles: string[] | null;
  fileFilter: string;
  showIgnoredFiles: boolean;
  files: Array<{ path: string; pinned: boolean }>;
  activeFile: string | null;
}
interface GitWorkspace { version: 1; changeView: ChangeViewPreferences; repositories: Record<string, RepositoryWorkspace> }
type Host = {
  kliprunGitWorkspace?: unknown;
  localStorage?: Pick<Storage, "getItem" | "setItem">;
  webkit?: { messageHandlers?: { gitWorkspace?: { postMessage: (value: GitWorkspace) => void } } };
};
export const GIT_WORKSPACE_KEY = "kliprun.git.workspace";
const host = (): Host => typeof window === "undefined" ? {} : window;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const path = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !value.includes("\0") && !value.split("/").includes("..");
export const emptyRepositoryWorkspace = (): RepositoryWorkspace => ({ tab: "changes", selection: null, diffClosed: false, changeFolders: {}, changesDefaultOpen: true, expandedFiles: null, fileFilter: "", showIgnoredFiles: true, files: [], activeFile: null });

function readRepository(value: unknown): RepositoryWorkspace {
  const saved = object(value) ? value : {}, selection = object(saved.selection) ? saved.selection : {};
  return {
    tab: saved.tab === "files" || saved.tab === "history" ? saved.tab : "changes",
    selection: path(selection.path) && (selection.mode === "staged" || selection.mode === "unstaged") ? { path: selection.path, mode: selection.mode } : null,
    diffClosed: saved.diffClosed === true,
    changeFolders: Object.fromEntries(Object.entries(object(saved.changeFolders) ? saved.changeFolders : {}).filter((entry): entry is [string, boolean] => entry[0].length <= 8192 && !entry[0].includes("\0") && typeof entry[1] === "boolean").slice(0, 10000)),
    changesDefaultOpen: saved.changesDefaultOpen !== false,
    expandedFiles: Array.isArray(saved.expandedFiles) ? saved.expandedFiles.filter(path).slice(0, 10000) : null,
    fileFilter: typeof saved.fileFilter === "string" ? saved.fileFilter.slice(0, 2000) : "",
    showIgnoredFiles: saved.showIgnoredFiles !== false,
    files: Array.isArray(saved.files) ? saved.files.filter(object).filter(file => path(file.path)).slice(0, 200).map(file => ({ path: file.path as string, pinned: file.pinned === true })) : [],
    activeFile: path(saved.activeFile) ? saved.activeFile : null,
  };
}
function load(native: Host): GitWorkspace {
  let value = native.kliprunGitWorkspace;
  try { value ??= JSON.parse(native.localStorage?.getItem(GIT_WORKSPACE_KEY) ?? "null"); } catch { /* storage unavailable */ }
  const saved = object(value) && value.version === 1 ? value : {};
  let legacy = null;
  try { legacy = native.localStorage?.getItem(CHANGE_VIEW_KEY) ?? null; } catch { /* storage unavailable */ }
  return { version: 1, changeView: readChangeView(saved.changeView ? JSON.stringify(saved.changeView) : legacy),
    repositories: Object.fromEntries(Object.entries(object(saved.repositories) ? saved.repositories : {})
      .filter(([directory]) => directory.startsWith("/") && directory.length <= 4096 && !directory.includes("\0")).slice(-100).map(([directory, value]) => [directory, readRepository(value)])) };
}
function save(value: GitWorkspace, native: Host) {
  native.kliprunGitWorkspace = value;
  try { native.localStorage?.setItem(GIT_WORKSPACE_KEY, JSON.stringify(value)); } catch { /* native storage remains available */ }
  native.webkit?.messageHandlers?.gitWorkspace?.postMessage(value);
}
export function loadRepositoryWorkspace(directory: string, native = host()): RepositoryWorkspace {
  return load(native).repositories[directory] ?? emptyRepositoryWorkspace();
}
export function hasRepositoryWorkspace(directory: string, native = host()) { return Object.hasOwn(load(native).repositories, directory); }
export function saveRepositoryWorkspace(directory: string, patch: Partial<RepositoryWorkspace> | ((previous: RepositoryWorkspace) => Partial<RepositoryWorkspace>), native = host()): RepositoryWorkspace {
  const workspace = load(native), previous = workspace.repositories[directory] ?? emptyRepositoryWorkspace();
  const next = readRepository({ ...previous, ...(typeof patch === "function" ? patch(previous) : patch) });
  if (directory.startsWith("/") && directory.length <= 4096 && !directory.includes("\0")) {
    workspace.repositories = Object.fromEntries([...Object.entries(workspace.repositories).filter(([key]) => key !== directory), [directory, next]].slice(-100));
    save(workspace, native);
  }
  return next;
}
export function loadChangeView(native = host()) { return load(native).changeView; }
export function saveChangeView(changeView: ChangeViewPreferences, native = host()) { save({ ...load(native), changeView }, native); }
