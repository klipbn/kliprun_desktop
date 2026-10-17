import type { GitCommitFile } from "@shared/git";
import { Folder, Square, SquareCheck } from "lucide-react";
import "./gitReview.css";

export function Counts({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  return <span className="git-counts">{additions === null || deletions === null ? <small>Binary</small> : <><span>+{additions}</span><span>−{deletions}</span></>}</span>;
}
type FileEntry = GitCommitFile & { mode?: "staged" | "unstaged" };
type Tree = { folders: Map<string, Tree>; files: FileEntry[] };
const statusLabels: Record<string, string> = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", C: "Copied", U: "Conflicted", T: "Type changed", "?": "Untracked" };
export function FileTree({ files, selected, selectedMode, onSelect, onAction, actionLabel, disabled, view = "tree", sortBy = "path", showMode = false }: {
  files: FileEntry[]; selected: string | null; selectedMode?: FileEntry["mode"]; onSelect: (path: string, mode?: FileEntry["mode"]) => void;
  onAction?: (paths: string[], mode?: FileEntry["mode"]) => void; actionLabel?: string; disabled: boolean;
  view?: "list" | "tree"; sortBy?: "path" | "name"; showMode?: boolean;
}) {
  const root: Tree = { folders: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    for (const part of view === "tree" ? file.path.split("/").slice(0, -1) : []) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
      node = node.folders.get(part)!;
    }
    node.files.push(file);
  }
  function render(node: Tree) {
    return <ul className={`git-tree git-review-tree${view === "list" ? " git-file-list" : ""}`}>
      {[...node.folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, folder]) => <li key={`folder:${name}`}><details open>
        <summary><Folder size={14} /><span>{name}</span></summary>{render(folder)}
      </details></li>)}
      {[...node.files].sort((a, b) => (sortBy === "name" ? a.path.split("/").at(-1)!.localeCompare(b.path.split("/").at(-1)!) : 0) || a.path.localeCompare(b.path)).map(file => {
        const chosen = file.path === selected && (selectedMode === undefined || file.mode === selectedMode);
        const label = file.mode ? file.mode === "staged" ? "Unstage" : "Stage" : actionLabel;
        const parent = file.path.split("/").slice(0, -1).join("/");
        return <li className={`git-file ${chosen ? "is-selected" : ""}`} data-status={file.status} key={`${file.mode ?? ""}:${file.path}`}>
        {onAction && <button type="button" className="git-file-action" disabled={disabled} aria-label={`${label} ${file.path}`} title={`${label} ${file.path}`}
          data-state={label === "Unstage" ? "checked" : "unchecked"} onClick={() => onAction([file.path], file.mode)}>
          {label === "Unstage" ? <SquareCheck size={14} /> : <Square size={14} />}
        </button>}
        <button type="button" className="git-file-select" onClick={() => onSelect(file.path, file.mode)} aria-pressed={chosen}
          title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
          <span className={`git-file-status status-${file.status}`} aria-label={statusLabels[file.status] ?? file.status} title={statusLabels[file.status] ?? file.status}>{file.status}</span>
          <span className="git-file-label"><span className={`git-file-name ${file.status === "D" ? "git-deleted" : ""}`}>{file.path.split("/").at(-1)}</span>
            {view === "list" && parent && <small className="git-file-directory">{parent}</small>}
          </span>
          {showMode && file.mode && <small className="git-file-mode">{file.mode === "staged" ? "Staged" : "Unstaged"}</small>}
          {file.status === "?" ? <span className="git-counts"><small>New</small></span> : <Counts {...file} />}
        </button>
      </li>; })}
    </ul>;
  }
  return render(root);
}
