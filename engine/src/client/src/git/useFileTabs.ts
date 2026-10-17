import { useEffect, useRef, useState } from "react";
import type { GitFileContent } from "@shared/git";
import { closeFileTab, editFileTab, isFileDirty, openFileTab, type FileDraft, type FileTab, type FileTabs } from "./fileTabs";
import { gitRequest } from "./useGitRequest";

const drafts = new Map<string, FileDraft>();
let nextId = 0;
const keyFor = (directory: string, path: string) => JSON.stringify([directory, path]);
function restored(directory: string): FileTabs {
  const tabs: FileTab[] = [...drafts.entries()].filter(([key]) => JSON.parse(key)[0] === directory).map(([, file]) => ({ id: ++nextId, path: file.path, pinned: true, file, loading: false, error: null, saving: false, savedAt: 0 }));
  return { directory, tabs, activeId: tabs[0]?.id ?? null };
}
export function useFileTabs(directory: string, onSaved: () => void) {
  const [state, setState] = useState(() => restored(directory));
  const stateRef = useRef(state);
  const currentDirectory = useRef(directory); currentDirectory.current = directory;
  const controllers = useRef(new Map<number, AbortController>());
  const mounted = useRef(true);
  function update(change: (state: FileTabs) => FileTabs) {
    const next = change(stateRef.current); stateRef.current = next;
    if (mounted.current) setState(next);
  }
  function patch(id: number, changes: Partial<FileTab>) { update(previous => ({ ...previous, tabs: previous.tabs.map(tab => tab.id === id ? { ...tab, ...changes } : tab) })); }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const controller of controllers.current.values()) controller.abort(); controllers.current.clear(); };
  }, []);
  useEffect(() => {
    if (stateRef.current.directory === directory) return;
    for (const controller of controllers.current.values()) controller.abort(); controllers.current.clear();
    update(() => restored(directory));
  }, [directory]);
  function clear() {
    for (const controller of controllers.current.values()) controller.abort(); controllers.current.clear();
    update(previous => ({ ...previous, tabs: [], activeId: null }));
  }
  async function open(path: string, permanent = false) {
    if (stateRef.current.directory !== directory) return;
    const cached = drafts.get(keyFor(directory, path)) ?? null;
    const document: FileTab = { id: ++nextId, path, pinned: permanent || !!cached, file: cached, loading: !cached, error: null, saving: false, savedAt: 0 };
    const existing = stateRef.current.tabs.some(tab => tab.path === path);
    update(previous => openFileTab(previous, document));
    if (existing) return;
    for (const [id, controller] of controllers.current) if (!stateRef.current.tabs.some(tab => tab.id === id)) { controller.abort(); controllers.current.delete(id); }
    const controller = new AbortController(); controllers.current.set(document.id, controller);
    try {
      const data = await gitRequest<GitFileContent>(`/api/git/file?${new URLSearchParams({ directory, path })}`, { signal: controller.signal });
      if (!controller.signal.aborted && currentDirectory.current === directory) {
        const current = stateRef.current.tabs.find(tab => tab.id === document.id);
        patch(document.id, { file: current?.file ?? { ...data, draft: data.content }, loading: false });
      }
    } catch (error) {
      if (!controller.signal.aborted && currentDirectory.current === directory) patch(document.id, { loading: false, error: error instanceof Error ? error.message : "Unable to read file." });
    } finally { controllers.current.delete(document.id); }
  }
  function edit(id: number, content: string) {
    update(previous => editFileTab(previous, id, content));
    const tab = stateRef.current.tabs.find(tab => tab.id === id);
    if (!tab?.file) return;
    const key = keyFor(directory, tab.path);
    if (isFileDirty(tab)) drafts.set(key, tab.file); else drafts.delete(key);
  }
  function discard(ids: number[]) {
    for (const tab of stateRef.current.tabs) if (ids.includes(tab.id)) drafts.delete(keyFor(directory, tab.path));
    update(previous => ({ ...previous, tabs: previous.tabs.map(tab => ids.includes(tab.id) && tab.file ? { ...tab, file: { ...tab.file, draft: tab.file.content } } : tab) }));
  }
  function close(id: number) {
    controllers.current.get(id)?.abort(); controllers.current.delete(id);
    update(previous => closeFileTab(previous, id));
  }
  async function save(id: number): Promise<boolean> {
    const tab = stateRef.current.tabs.find(tab => tab.id === id);
    if (!tab?.file || tab.saving) return false;
    if (!isFileDirty(tab)) return true;
    const target = stateRef.current.directory, snapshot = tab.file;
    patch(id, { saving: true, error: null });
    try {
      const data = await gitRequest<GitFileContent>("/api/git/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory: target, path: tab.path, content: snapshot.draft, revision: snapshot.revision }) });
      const key = keyFor(target, tab.path);
      if (drafts.get(key) === snapshot) drafts.delete(key);
      if (mounted.current && currentDirectory.current === target) { patch(id, { file: { ...data, draft: data.content }, saving: false, savedAt: Math.max(Date.now(), tab.savedAt + 1) }); onSaved(); }
      return true;
    } catch (error) {
      if (mounted.current && currentDirectory.current === target) patch(id, { saving: false, error: error instanceof Error ? error.message : "Unable to save file." });
      return false;
    }
  }
  return { ...(state.directory === directory ? state : { directory, tabs: [], activeId: null }), open, edit, save, close, clear, discard,
    activate: (id: number) => update(previous => ({ ...previous, activeId: id })), pin: (id: number) => patch(id, { pinned: true }) };
}
