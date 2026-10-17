import { expect, test } from "bun:test";
import { groupChangeFiles, readChangeView, type ChangeEntry } from "../git/changeView";

const files: ChangeEntry[] = [
  { path: "src/shared.ts", mode: "staged", status: "M", additions: 2, deletions: 0 },
  { path: "src/shared.ts", mode: "unstaged", status: "M", additions: 1, deletions: 1 },
  { path: "new.txt", mode: "unstaged", status: "?", additions: 0, deletions: 0 },
];
test("change grouping preserves both sides of partially staged files and isolates untracked entries", () => {
  expect(groupChangeFiles(files, "none").map(group => [group.name, group.files.length])).toEqual([[null, 3]]);
  expect(groupChangeFiles(files, "tracked").map(group => [group.name, group.files.map(file => `${file.mode}:${file.path}`)])).toEqual([
    ["Tracked", ["staged:src/shared.ts", "unstaged:src/shared.ts"]], ["Untracked", ["unstaged:new.txt"]],
  ]);
  expect(groupChangeFiles(files, "staged").map(group => [group.name, group.files.length])).toEqual([["Staged", 1], ["Unstaged", 2]]);
  expect(groupChangeFiles([], "staged")).toEqual([]);
  expect(files).toHaveLength(3);
});
test("saved changes display options reject malformed data and keep valid choices", () => {
  const defaults = { view: "list", sortBy: "path", groupBy: "none" } as const;
  for (const value of [null, "invalid", "null", "[]", '{"view":"other","sortBy":42,"groupBy":"bad"}']) expect(readChangeView(value)).toEqual(defaults);
  expect(readChangeView('{"view":"tree","sortBy":"name","groupBy":"tracked"}')).toEqual({ view: "tree", sortBy: "name", groupBy: "tracked" });
  expect(readChangeView('{"view":"bad","sortBy":"name","groupBy":"staged"}')).toEqual({ view: "list", sortBy: "name", groupBy: "staged" });
});
