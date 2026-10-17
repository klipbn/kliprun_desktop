import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, SlidersHorizontal } from "lucide-react";
import type { ChangeViewPreferences } from "./changeView";

const sections = [
  { key: "view", title: "View", options: [["list", "List"], ["tree", "Tree"]] },
  { key: "sortBy", title: "Sort By", options: [["path", "Path"], ["name", "Name"]] },
  { key: "groupBy", title: "Group By", options: [["none", "None"], ["tracked", "Tracked & Untracked"], ["staged", "Staged & Unstaged"]] },
] as const;

export function ChangeViewSettings({ preferences, onChange }: { preferences: ChangeViewPreferences; onChange: (value: ChangeViewPreferences) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ left: 12, top: 12, width: 260, maxHeight: 380 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const id = useId();
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function place() {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const width = Math.min(260, window.innerWidth - 24);
    const above = rect.top - 18, below = window.innerHeight - rect.bottom - 18;
    const useBelow = below >= Math.min(380, above);
    setPosition({ width, maxHeight: Math.min(380, Math.max(40, useBelow ? below : above)),
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      ...(useBelow ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) });
  }
  useEffect(() => {
    if (!open) return;
    place(); popup.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
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

  return <>
    <button ref={trigger} type="button" className={`git-button git-view-settings-trigger ${open ? "is-open" : ""}`}
      aria-label="Changes view settings" title="Changes view settings" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(true); else { place(); setOpen(true); } }}><SlidersHorizontal size={15} /></button>
    {open && createPortal(<div ref={popup} id={id} role="menu" aria-label="Changes view settings" className="git-view-settings-menu" style={position}
      onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
        buttons[next]?.focus();
      }}>
      {sections.map(section => <section key={section.key} role="group" aria-label={section.title}>
        <h3>{section.title}</h3>
        {section.options.map(([value, label]) => <button key={value} type="button" role="menuitemradio" aria-checked={preferences[section.key] === value}
          onClick={() => onChange({ ...preferences, [section.key]: value })}><span>{label}</span>{preferences[section.key] === value && <Check size={14} />}</button>)}
      </section>)}
    </div>, document.body)}
  </>;
}
