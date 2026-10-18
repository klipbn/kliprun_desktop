import { expect, test } from "bun:test";
import { GIT_WORKSPACE_KEY, loadChangeView, loadRepositoryWorkspace, saveChangeView, saveRepositoryWorkspace } from "../git/workspaceState";

test("Git workspace keeps each repository's files, active tab, closed folders and selected diff across reloads", () => {
  const values = new Map<string, string>(), host = { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } };
  saveRepositoryWorkspace("/atlas", { tab: "files", expandedFiles: [], files: [{ path: "src/a.ts", pinned: true }, { path: "README.md", pinned: false }], activeFile: "src/a.ts",
    selection: { path: "src/b.ts", mode: "staged" }, changesDefaultOpen: false }, host);
  saveRepositoryWorkspace("/aurora", { tab: "changes", changeFolders: { "all:src": false }, diffClosed: true }, host);
  const reloaded = { localStorage: host.localStorage };
  expect(loadRepositoryWorkspace("/atlas", reloaded)).toMatchObject({ tab: "files", expandedFiles: [], activeFile: "src/a.ts", files: [{ path: "src/a.ts", pinned: true }, { path: "README.md", pinned: false }], selection: { path: "src/b.ts", mode: "staged" }, changesDefaultOpen: false, diffClosed: false });
  expect(loadRepositoryWorkspace("/aurora", reloaded)).toMatchObject({ tab: "changes", changeFolders: { "all:src": false }, diffClosed: true, files: [] });
  expect(values.get(GIT_WORKSPACE_KEY)).not.toContain('"content"');
});

test("Git uses the native snapshot after origin changes and migrates existing display settings", () => {
  const posted: unknown[] = [];
  const host = { kliprunGitWorkspace: undefined as unknown, localStorage: { getItem: () => '{"view":"tree","sortBy":"name","groupBy":"staged"}', setItem() {} },
    webkit: { messageHandlers: { gitWorkspace: { postMessage: (value: unknown) => { posted.push(value); } } } } };
  expect(loadChangeView(host)).toEqual({ view: "tree", sortBy: "name", groupBy: "staged" });
  saveRepositoryWorkspace("/atlas", { tab: "files", expandedFiles: [] }, host);
  saveChangeView({ view: "tree", sortBy: "path", groupBy: "tracked" }, host);
  const newOrigin = { kliprunGitWorkspace: posted.at(-1), localStorage: { getItem: () => null, setItem() {} } };
  expect(loadRepositoryWorkspace("/atlas", newOrigin)).toMatchObject({ tab: "files", expandedFiles: [] });
  expect(loadChangeView(newOrigin)).toEqual({ view: "tree", sortBy: "path", groupBy: "tracked" });
});

test("Git ignores malformed state and unsafe restored paths", () => {
  const host = { kliprunGitWorkspace: { version: 1, repositories: { "/atlas": { tab: "bad", expandedFiles: ["src", "../outside"], files: [{ path: "/etc/passwd" }, { path: "../outside" }, { path: "README.md", pinned: true }], selection: { path: "../outside", mode: "staged" }, changeFolders: { src: "false" } } } } };
  expect(loadRepositoryWorkspace("/atlas", host)).toMatchObject({ tab: "changes", expandedFiles: ["src"], files: [{ path: "README.md", pinned: true }], selection: null, changeFolders: {} });
});
