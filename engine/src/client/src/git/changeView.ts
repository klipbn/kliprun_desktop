import type { GitCommitFile } from "@shared/git";

export interface ChangeViewPreferences {
  view: "list" | "tree";
  sortBy: "path" | "name";
  groupBy: "none" | "tracked" | "staged";
}
export type ChangeEntry = GitCommitFile & { mode: "staged" | "unstaged" };
export const CHANGE_VIEW_KEY = "kliprun.git.changes-view";

export function readChangeView(value: string | null): ChangeViewPreferences {
  try {
    const saved = JSON.parse(value ?? "null");
    return { view: saved?.view === "tree" ? "tree" : "list", sortBy: saved?.sortBy === "name" ? "name" : "path",
      groupBy: saved?.groupBy === "tracked" || saved?.groupBy === "staged" ? saved.groupBy : "none" };
  } catch { return { view: "list", sortBy: "path", groupBy: "none" }; }
}

export function groupChangeFiles(files: ChangeEntry[], groupBy: ChangeViewPreferences["groupBy"]): Array<{ name: string | null; files: ChangeEntry[] }> {
  if (groupBy === "none") return files.length ? [{ name: null, files }] : [];
  return groupBy === "tracked" ? [
    { name: "Tracked", files: files.filter(file => file.status !== "?") },
    { name: "Untracked", files: files.filter(file => file.status === "?") },
  ].filter(group => group.files.length) : [
    { name: "Staged", files: files.filter(file => file.mode === "staged") },
    { name: "Unstaged", files: files.filter(file => file.mode === "unstaged") },
  ].filter(group => group.files.length);
}
