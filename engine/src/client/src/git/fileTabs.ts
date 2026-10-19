import type { GitFileContent } from "@shared/git";
export type FileDraft = GitFileContent & { draft: string };
export type FileTab = { id: number; path: string; pinned: boolean; file: FileDraft | null; loading: boolean; error: string | null; saving: boolean; savedAt: number };
export type FileTabs = { directory: string; tabs: FileTab[]; activeId: number | null };
export function isFileDirty(tab: FileTab) { return !!tab.file && tab.file.draft !== tab.file.content; }
export function openFileTab(state: FileTabs, document: FileTab): FileTabs {
  const existing = state.tabs.find(tab => tab.path === document.path);
  if (existing) return { ...state, activeId: existing.id, tabs: state.tabs.map(tab => tab.id === existing.id && document.pinned ? { ...tab, pinned: true } : tab) };
  const preview = document.pinned ? -1 : state.tabs.findIndex(tab => !tab.pinned && !isFileDirty(tab) && !tab.saving);
  const tabs = [...state.tabs];
  if (preview < 0) tabs.push(document); else tabs.splice(preview, 1, document);
  return { ...state, tabs, activeId: document.id };
}
export function editFileTab(state: FileTabs, id: number, content: string): FileTabs {
  return { ...state, tabs: state.tabs.map(tab => tab.id === id && tab.file ? { ...tab, pinned: true, file: { ...tab.file, draft: content } } : tab) };
}
export function refreshFileTab(state: FileTabs, id: number, snapshot: FileDraft, data: GitFileContent): FileTabs {
  const tab = state.tabs.find(tab => tab.id === id);
  if (!tab || tab.file !== snapshot || tab.saving || isFileDirty(tab) || data.root !== snapshot.root || data.path !== snapshot.path) return state;
  if (data.revision === snapshot.revision && !tab.error) return state;
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, file: { ...data, draft: data.content }, error: null } : tab) };
}
export function closeFileTab(state: FileTabs, id: number): FileTabs {
  const index = state.tabs.findIndex(tab => tab.id === id), tabs = state.tabs.filter(tab => tab.id !== id);
  return { ...state, tabs, activeId: state.activeId === id ? tabs[Math.max(0, index - 1)]?.id ?? null : state.activeId };
}
