import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import "./recent-session-filter.css";

interface Option { value: string; label: string; path?: string }

export function RecentSessionFilter({ label, name, value, options, onChange, searchable = false, disabled = false, placement = "sidebar", searchSubject = "projects" }: {
  label?: string; name: string; value: string; options: Option[]; onChange: (value: string) => void; searchable?: boolean;
  disabled?: boolean; placement?: "sidebar" | "viewport"; searchSubject?: string;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null), id = useId();
  const selected = options.find(option => option.value === value) ?? options[0];
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  const matches = options.filter(option => !option.value || words.every(word => `${option.label} ${option.path ?? ""}`.toLocaleLowerCase().includes(word)));
  const highlighted = Math.min(active, matches.length - 1);
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function show() { setQuery(""); setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); }
  function choose(option: Option) { if (!disabled) onChange(option.value); close(true); }
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const sidebar = trigger.current?.closest("aside");
    function place() {
      const rect = trigger.current?.getBoundingClientRect(), bounds = sidebar?.getBoundingClientRect();
      if (!rect) return;
      if (placement === "viewport") {
        const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 16);
        const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
        const useBelow = below >= Math.min(280, above);
        setPosition({ position: "fixed", left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), right: "auto", width,
          maxHeight: Math.max(0, Math.min(340, useBelow ? below : above)),
          ...(useBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) });
        return;
      }
      if (!bounds) return;
      const top = Math.max(bounds.top + 4, Math.min(rect.top, bounds.bottom - 4));
      const bottom = Math.max(bounds.top + 4, Math.min(rect.bottom, bounds.bottom - 4));
      const above = top - bounds.top - 4, below = bounds.bottom - bottom - 4;
      const useBelow = below >= Math.min(280, above);
      setPosition({ maxHeight: Math.min(300, Math.max(0, useBelow ? below : above)),
        ...(useBelow ? { top: bottom - bounds.top + 4 } : { bottom: bounds.bottom - top + 4 }) });
    }
    place(); (input.current ?? list.current)?.focus();
    const observer = new ResizeObserver(place);
    if (sidebar) observer.observe(sidebar);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", place);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, [open, placement]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-option-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, query]);

  return <div className="recent-filter">
    {label && <span>{label}</span>}
    <button ref={trigger} type="button" className="recent-filter-trigger" aria-label={name} title={selected?.path ?? selected?.label} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close(true) : show()}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}>
      <span>{selected?.label ?? "Choose…"}</span><ChevronDown size={12} />
    </button>
    {open && <div ref={popup} className="recent-filter-popup" style={position} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); if (matches.length) setActive((highlighted + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
      } else if (event.key === "Enter") { event.preventDefault(); if (matches[highlighted]) choose(matches[highlighted]); }
      else if ((event.key === "Home" || event.key === "End") && event.target !== input.current) {
        event.preventDefault(); setActive(event.key === "Home" ? 0 : matches.length - 1);
      }
    }}>
      {searchable && <div className="recent-project-search"><Search size={13} /><input ref={input} type="search" aria-label={`Search ${searchSubject}`}
        placeholder={`Search ${searchSubject}…`} value={query} aria-controls={id} aria-activedescendant={matches.length ? `${id}-${highlighted}` : undefined}
        onChange={event => { setQuery(event.target.value); setActive(0); }} /></div>}
      <div ref={list} id={id} role="listbox" aria-label={name} tabIndex={searchable ? -1 : 0} aria-activedescendant={`${id}-${highlighted}`} className="recent-filter-options">
        {matches.map((option, index) => <button type="button" role="option" tabIndex={-1} key={option.value} id={`${id}-${index}`}
          aria-selected={option.value === value} data-option-index={index} className={highlighted === index ? "is-active" : ""}
          title={option.path ?? option.label} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}>
          <span><strong>{option.label}</strong>{option.path && <small>{option.path}</small>}</span>{option.value === value && <Check size={12} />}
        </button>)}
        {!matches.some(option => option.value) && query.trim() && <p className="recent-project-empty">No matching {searchSubject}</p>}
      </div>
    </div>}
  </div>;
}
