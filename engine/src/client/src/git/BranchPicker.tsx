import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, ChevronDown, GitBranch as BranchIcon, Plus, Search } from "lucide-react";
import type { GitBranch, GitStatus } from "@shared/git";
import { formatRelativeTimeVerbose } from "@shared/format";

export function BranchPicker({ status, disabled, onSwitch, onCreate }: {
  status: GitStatus | null; disabled: boolean; onSwitch: (branch: string) => void; onCreate: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ left: 12, bottom: 12, width: 420, maxHeight: 400 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const id = useId();
  const name = status?.branch ?? (status?.head ? `Detached ${status.head.slice(0, 7)}` : "Branch");
  const branches = [...(status?.branches ?? [])];
  if (status?.branch && !branches.some(branch => !branch.remote && branch.name === status.branch)) {
    branches.unshift({ name: status.branch, current: true, remote: false, upstream: null, author: null, date: null, subject: null });
  }
  const search = query.trim();
  const matches = branches.filter(branch => branch.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) =>
    Number(a.remote) - Number(b.remote) || Number(b.current) - Number(a.current) || (b.date ?? 0) - (a.date ?? 0) || a.name.localeCompare(b.name));
  const canCreate = !!search && !branches.some(branch => !branch.remote && branch.name === search);
  const count = matches.length + Number(canCreate), highlighted = Math.min(active, count - 1);

  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function place() {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const width = Math.min(440, window.innerWidth - 24);
    const above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
    const useAbove = above >= below;
    const maxHeight = Math.min(440, Math.max(100, useAbove ? above : below));
    setPosition({ width, maxHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(useAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
  }
  function choose(branch?: GitBranch) {
    close(true);
    if (branch && !branch.current) onSwitch(branch.name);
    else if (!branch && canCreate) onCreate(search);
  }
  useEffect(() => {
    if (!open) return;
    place(); input.current?.focus();
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(true); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLElement>(`[data-branch-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, query]);

  return <div className="git-branch-picker">
    <button ref={trigger} type="button" className="git-branch-toggle" disabled={!status || disabled} aria-label="Switch branch" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
      title={`${name}${status?.upstream ? ` · ${status.upstream} · ${status.ahead} ahead, ${status.behind} behind` : ""}`}
      onClick={() => { if (open) close(true); else { place(); setQuery(""); setActive(0); setOpen(true); } }}>
      <BranchIcon size={14} /><span className="git-branch-name">{name}</span>
      {status?.upstream && <span className="git-divergence"><ArrowUp size={11} />{status.ahead}<ArrowDown size={11} />{status.behind}</span>}
      <ChevronDown size={12} />
    </button>
    {open && createPortal(<div ref={popup} className="git-branch-popover" style={position}>
      <div id={id} className="git-branch-options" role="listbox" aria-label="Branches">
        {[false, true].map(remote => {
          const group = matches.filter(branch => branch.remote === remote);
          return group.length > 0 && <section role="group" aria-label={remote ? "Remote Branches" : "Local Branches"} key={String(remote)}>
            <h3>{remote ? "Remote Branches" : "Local Branches"}</h3>
            {group.map(branch => {
              const index = matches.indexOf(branch);
              return <button type="button" role="option" id={`${id}-${index}`} key={branch.name} tabIndex={-1} aria-selected={branch.current}
                aria-label={branch.current ? `Current branch ${branch.name}` : `Switch to ${branch.name}`} data-branch-index={index}
                className={`git-branch-option ${index === highlighted ? "is-active" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => choose(branch)}>
                {branch.current ? <Check size={15} className="git-current-branch" /> : <BranchIcon size={15} />}
                <span><strong title={branch.name}>{branch.name}</strong><small title={branch.subject ?? undefined}>{[
                  branch.author, branch.date ? formatRelativeTimeVerbose(branch.date) : null, branch.subject,
                ].filter(Boolean).join(" · ") || "No commits yet"}</small></span>
              </button>;
            })}
          </section>;
        })}
        {canCreate && <button type="button" role="option" id={`${id}-${matches.length}`} tabIndex={-1} aria-selected={false} aria-label={`Create branch ${search}`}
          data-branch-index={matches.length} className={`git-branch-option git-create-branch ${highlighted === matches.length ? "is-active" : ""}`}
          onMouseEnter={() => setActive(matches.length)} onClick={() => choose()}><Plus size={15} /><span><strong>Create “{search}”</strong><small>Create from the current HEAD and switch</small></span></button>}
        {!count && <p className="git-branch-no-results">No matching branches</p>}
      </div>
      <label className="git-branch-search"><Search size={15} /><input ref={input} role="combobox" aria-label="Switch or create a branch" aria-expanded={true} aria-controls={id}
        aria-autocomplete="list" aria-activedescendant={highlighted >= 0 ? `${id}-${highlighted}` : undefined}
        placeholder="Switch or type to create a branch…" value={query} maxLength={256} onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={event => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && count) { event.preventDefault(); setActive((highlighted + (event.key === "ArrowDown" ? 1 : count - 1)) % count); }
          if (event.key === "Enter" && highlighted >= 0 && !event.nativeEvent.isComposing) { event.preventDefault(); choose(matches[highlighted]); }
        }} /></label>
    </div>, document.body)}
  </div>;
}
