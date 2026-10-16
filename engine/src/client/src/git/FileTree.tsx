import type { GitCommitFile } from "@shared/git";
import { File, Folder, Minus, Plus } from "lucide-react";

export function Counts({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  return <span className="git-counts">{additions === null || deletions === null ? <small>Binary</small> : <><span>+{additions}</span><span>−{deletions}</span></>}</span>;
}
type Tree = { folders: Map<string, Tree>; files: GitCommitFile[] };
export function FileTree({ files, selected, onSelect, onAction, actionLabel, disabled }: {
  files: GitCommitFile[]; selected: string | null; onSelect: (path: string) => void;
  onAction?: (paths: string[]) => void; actionLabel?: string; disabled: boolean;
}) {
  const root: Tree = { folders: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    for (const part of file.path.split("/").slice(0, -1)) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
      node = node.folders.get(part)!;
    }
    node.files.push(file);
  }
  function render(node: Tree) {
    return <ul className="git-tree">
      {[...node.folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, folder]) => <li key={`folder:${name}`}><details open>
        <summary><Folder size={14} /><span>{name}</span></summary>{render(folder)}
      </details></li>)}
      {node.files.sort((a, b) => a.path.localeCompare(b.path)).map(file => <li className={`git-file ${file.path === selected ? "is-selected" : ""}`} key={file.path}>
        <button type="button" className="git-file-select" onClick={() => onSelect(file.path)} aria-pressed={file.path === selected}
          title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
          <span className={`git-file-status status-${file.status}`} aria-label={file.status}>{file.status === "?" ? <File size={13} /> : file.status}</span>
          <span className={file.status === "D" ? "git-deleted" : ""}>{file.path.split("/").at(-1)}</span>
          {file.status === "?" ? <span className="git-counts"><small>New</small></span> : <Counts {...file} />}
        </button>
        {onAction && <button type="button" className="git-file-action" disabled={disabled} aria-label={`${actionLabel} ${file.path}`} title={`${actionLabel} ${file.path}`}
          onClick={() => onAction([file.path])}>{actionLabel === "Unstage" ? <Minus size={14} /> : <Plus size={14} />}</button>}
      </li>)}
    </ul>;
  }
  return render(root);
}
