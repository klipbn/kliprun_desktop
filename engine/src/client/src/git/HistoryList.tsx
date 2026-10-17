import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import type { GitCommit } from "@shared/git";
import "./historyList.css";

export function filterHistoryCommits(commits: GitCommit[], filter: string): GitCommit[] {
  const query = filter.trim().toLowerCase();
  return query ? commits.filter(commit => [commit.subject, commit.author, commit.hash, ...commit.refs].some(value => value.toLowerCase().includes(query))) : commits;
}

export function HistoryList({ commits, selected, onSelect }: {
  commits: GitCommit[]; selected: string | null; onSelect: (hash: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => filterHistoryCommits(commits, filter), [commits, filter]);
  const input = useRef<HTMLInputElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selectedVisible = visible.some(commit => commit.hash === selected);
  function move(index: number) {
    const commit = visible[index];
    if (!commit) return;
    buttons.current.get(commit.hash)?.focus();
    onSelect(commit.hash);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "ArrowDown": next = Math.min(visible.length - 1, index + 1); break;
      case "Home": next = 0; break;
      case "End": next = visible.length - 1; break;
      default: return;
    }
    event.preventDefault(); move(next);
  }
  return <div className="git-history-list">
    <div className="git-history-search-heading">
      <div className="git-history-search"><Search size={13} aria-hidden="true" /><input ref={input} aria-label="Search commits" placeholder="Search loaded commits" value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setFilter(""); if (event.key === "ArrowDown") { event.preventDefault(); move(0); } }} />{filter && <button type="button" aria-label="Clear commit search" title="Clear commit search" onClick={() => { setFilter(""); input.current?.focus(); }}><X size={13} /></button>}</div>
      <span className="git-history-count" role="status">{filter.trim() ? `${visible.length} of ${commits.length} commits` : `${commits.length} ${commits.length === 1 ? "commit" : "commits"}`}</span>
    </div>
    <div className="git-history-entries" aria-label="Loaded commits">
      {visible.map((commit, index) => <button type="button" key={commit.hash} ref={element => { if (element) buttons.current.set(commit.hash, element); else buttons.current.delete(commit.hash); }} className={`git-history-row${selected === commit.hash ? " is-selected" : ""}`} aria-pressed={selected === commit.hash} tabIndex={selected === commit.hash || !selectedVisible && index === 0 ? 0 : -1} onClick={() => onSelect(commit.hash)} onKeyDown={event => navigate(event, index)} title={`${commit.subject}\n${commit.author} · ${new Date(commit.date).toLocaleString()}\n${commit.hash}`}>
        <span className="git-commit-dot" aria-hidden="true"><span /></span>
        <span className="git-history-text">
          <strong>{commit.subject}</strong>
          <span className="git-history-metadata"><span className="git-history-author">{commit.author}</span><span aria-hidden="true">·</span><time dateTime={new Date(commit.date).toISOString()}>{new Date(commit.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><span aria-hidden="true">·</span><code>{commit.hash.slice(0, 7)}</code></span>
          {commit.refs.length > 0 && <span className="git-refs">{commit.refs.slice(0, 2).map(ref => <small key={ref} title={ref}>{ref}</small>)}{commit.refs.length > 2 && <small title={commit.refs.slice(2).join("\n")}>+{commit.refs.length - 2}</small>}</span>}
        </span>
      </button>)}
    </div>
    {filter.trim() && !visible.length && <p className="git-history-no-results">No matching commits.</p>}
  </div>;
}
