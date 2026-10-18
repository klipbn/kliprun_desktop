export interface SessionGroup { id: string; name: string }
export interface SessionProject extends SessionGroup { groups: SessionGroup[] }
export interface SessionAssignment { projectId: string; groupId: string | null }
export interface SessionWorkspace {
  version: 1;
  projects: SessionProject[];
  assignments: Record<string, SessionAssignment>;
  favorites: string[];
  collapsed: string[];
  sidebarCollapsed: boolean;
  sidebarWidth?: number;
}
export const emptyWorkspace = (): SessionWorkspace => ({ version: 1, projects: [], assignments: {}, favorites: [], collapsed: [], sidebarCollapsed: false });
const KEY = "kliprun.sessionWorkspace";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
const strings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max && value.every(v => text(v, 512)) && new Set(value).size === value.length;

export function validateWorkspace(value: unknown): SessionWorkspace | null {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.projects) || value.projects.length > 200 || !object(value.assignments)
    || Object.keys(value.assignments).length > 100000 || !strings(value.favorites, 100000) || !strings(value.collapsed, 10000) || typeof value.sidebarCollapsed !== "boolean") return null;
  if (value.sidebarWidth !== undefined && (typeof value.sidebarWidth !== "number" || !Number.isFinite(value.sidebarWidth) || value.sidebarWidth < 118 || value.sidebarWidth > 480)) return null;
  const projects: SessionProject[] = [];
  for (const p of value.projects) {
    if (!object(p) || !text(p.id, 200) || !text(p.name, 60) || !Array.isArray(p.groups) || p.groups.length > 200
      || projects.some(other => other.id === p.id || other.name.toLowerCase() === String(p.name).toLowerCase())) return null;
    const groups: SessionGroup[] = [];
    for (const g of p.groups) {
      if (!object(g) || !text(g.id, 200) || !text(g.name, 60) || g.name.toLowerCase() === "uncategorized"
        || groups.some(other => other.id === g.id || other.name.toLowerCase() === String(g.name).toLowerCase())) return null;
      groups.push({ id: g.id, name: g.name });
    }
    projects.push({ id: p.id, name: p.name, groups });
  }
  const assignments: Array<[string, SessionAssignment]> = [];
  for (const [id, a] of Object.entries(value.assignments)) {
    if (!text(id, 512) || !object(a)) return null;
    const project = projects.find(p => p.id === a.projectId);
    if (!project || (a.groupId !== null && !project.groups.some(g => g.id === a.groupId))) return null;
    assignments.push([id, { projectId: project.id, groupId: a.groupId as string | null }]);
  }
  return { version: 1, projects, assignments: Object.fromEntries(assignments), favorites: [...value.favorites], collapsed: [...value.collapsed], sidebarCollapsed: value.sidebarCollapsed,
    ...(value.sidebarWidth === undefined ? {} : { sidebarWidth: value.sidebarWidth as number }) };
}

export function projectFor(state: SessionWorkspace, id: string) { return state.projects.find(p => p.id === state.assignments[id]?.projectId); }
export function groupFor(state: SessionWorkspace, id: string) { return projectFor(state, id)?.groups.find(g => g.id === state.assignments[id]?.groupId); }
function validName(name: string, names: string[], group = false) {
  const trimmed = name.trim();
  if (!text(trimmed, 60)) throw new Error("Enter a name between 1 and 60 characters.");
  if (names.some(n => n.toLowerCase() === trimmed.toLowerCase()) || (group && trimmed.toLowerCase() === "uncategorized")) throw new Error("This name is already in use.");
  return trimmed;
}
export function createProject(state: SessionWorkspace, id: string, name: string): SessionWorkspace {
  if (!text(id, 200) || state.projects.some(p => p.id === id) || state.projects.length >= 200) throw new Error("Unable to add another project.");
  return { ...state, projects: [...state.projects, { id, name: validName(name, state.projects.map(p => p.name)), groups: [] }] };
}
export function createGroup(state: SessionWorkspace, projectId: string, id: string, name: string): SessionWorkspace {
  const project = state.projects.find(p => p.id === projectId);
  if (!project || !text(id, 200) || project.groups.some(g => g.id === id) || project.groups.length >= 200) throw new Error("Unable to add another group.");
  const group = { id, name: validName(name, project.groups.map(g => g.name), true) };
  return { ...state, projects: state.projects.map(p => p.id === projectId ? { ...p, groups: [...p.groups, group] } : p) };
}
export function moveSessions(state: SessionWorkspace, ids: string[], projectId: string | null, groupId: string | null): SessionWorkspace {
  const project = state.projects.find(p => p.id === projectId);
  if ((projectId && !project) || (groupId && !project?.groups.some(g => g.id === groupId))) throw new Error("Choose a group in the destination project.");
  const assignments = { ...state.assignments };
  for (const id of ids) {
    if (!text(id, 512)) throw new Error("Invalid session.");
    if (projectId) Object.defineProperty(assignments, id, { value: { projectId, groupId }, enumerable: true, configurable: true, writable: true });
    else delete assignments[id];
  }
  return { ...state, assignments };
}
export function sortSessions<T extends { id: string; updated_at: number }>(rows: T[], state: SessionWorkspace): T[] {
  return [...rows].sort((a, b) => Number(!!projectFor(state, b.id)) - Number(!!projectFor(state, a.id)) || b.updated_at - a.updated_at || a.id.localeCompare(b.id));
}
type WorkspaceHost = { kliprunSessionWorkspace?: unknown; webkit?: { messageHandlers?: { sessionWorkspace?: { postMessage: (value: SessionWorkspace) => void } } } };
type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;
const host = (): WorkspaceHost => typeof window === "undefined" ? {} : window as WorkspaceHost;
function storage(): WorkspaceStorage | null { try { return window.localStorage; } catch { return null; } }
export function loadWorkspace(store: Pick<Storage, "getItem"> | null = storage(), native = host()): SessionWorkspace {
  if (native.kliprunSessionWorkspace !== undefined) return validateWorkspace(native.kliprunSessionWorkspace) ?? emptyWorkspace();
  try { return validateWorkspace(JSON.parse(store?.getItem(KEY) ?? "null")) ?? emptyWorkspace(); } catch { return emptyWorkspace(); }
}
export function saveWorkspace(state: SessionWorkspace, store = storage(), native = host()): void {
  if (!validateWorkspace(state)) throw new Error("Unable to save invalid workspace data.");
  if (new TextEncoder().encode(JSON.stringify(state)).length > 4 * 1024 * 1024) throw new Error("Workspace is too large to save.");
  // Native storage is independent of the engine's per-launch web origin.
  if (native.webkit?.messageHandlers?.sessionWorkspace) native.webkit.messageHandlers.sessionWorkspace.postMessage(state);
  else if (store) store.setItem(KEY, JSON.stringify(state));
  else throw new Error("Workspace storage is unavailable.");
  native.kliprunSessionWorkspace = state;
}
