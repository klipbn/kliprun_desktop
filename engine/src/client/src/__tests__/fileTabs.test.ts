import { expect, test } from "bun:test";
import { closeFileTab, editFileTab, openFileTab, type FileTab, type FileTabs } from "../git/fileTabs";
const document = (id: number, path: string, pinned = false): FileTab => ({ id, path, pinned, file: { root: "/demo", path, revision: "1", content: "original", draft: "original" }, loading: false, error: null, saving: false, savedAt: 0 });
const empty: FileTabs = { directory: "/demo", tabs: [], activeId: null };
test("single-click replaces only the clean preview while pinned documents stay open", () => {
  let state = openFileTab(empty, document(1, "first.py", true));
  state = openFileTab(state, document(2, "preview.sql"));
  state = openFileTab(state, document(3, "README.md"));
  expect(state.tabs.map(tab => tab.path)).toEqual(["first.py", "README.md"]);
  expect(state.activeId).toBe(3);
});
test("editing pins the preview and opening another file preserves its unsaved contents", () => {
  let state = openFileTab(empty, document(1, "first.py"));
  state = editFileTab(state, 1, "unsaved");
  state = openFileTab(state, document(2, "second.py"));
  expect(state.tabs).toHaveLength(2);
  expect(state.tabs[0].pinned).toBe(true);
  expect(state.tabs[0].file?.draft).toBe("unsaved");
});
test("double-click pins an existing preview without duplicating it", () => {
  const state = openFileTab(openFileTab(empty, document(1, "first.py")), document(2, "first.py", true));
  expect(state.tabs).toHaveLength(1);
  expect(state.activeId).toBe(1);
  expect(state.tabs[0].pinned).toBe(true);
});
test("closing the active tab selects its neighbor and leaves other drafts unchanged", () => {
  let state = openFileTab(openFileTab(empty, document(1, "first.py", true)), document(2, "second.py", true));
  state = editFileTab(state, 1, "unsaved");
  state = closeFileTab(state, 2);
  expect(state.activeId).toBe(1);
  expect(state.tabs[0].file?.draft).toBe("unsaved");
  expect(closeFileTab(state, 1).activeId).toBeNull();
});
