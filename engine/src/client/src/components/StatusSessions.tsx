import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { CardPayload } from "@shared/types";
import { SESSION_SOURCE_NAMES } from "@shared/types";
import { HarnessIcon } from "./HarnessIcon";
import "./statusSessions.css";

export function StatusSessions({ label, cards, children, onSelect }: {
  label: string; cards: CardPayload[]; children: ReactNode; onSelect: (id: string) => void;
}) {
  const group = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, bottom: 40, width: 340 });
  const id = useId();
  const show = () => {
    const box = trigger.current?.getBoundingClientRect(); if (!box) return;
    const width = Math.min(360, window.innerWidth - 24);
    setPosition({ left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)), bottom: window.innerHeight - box.top, width });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!group.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); };
  }, [open]);
  return <div ref={group} className="status-session-group" onMouseEnter={show}
    onMouseLeave={() => { if (!group.current?.contains(document.activeElement)) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false); } }}>
    <button ref={trigger} type="button" className="status-session-trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}
      onClick={show} onFocus={show}>{children}</button>
    {open && <div className="status-session-popover" style={position} id={id} role="dialog" aria-label={label}>
      <div className="status-session-panel"><h2>{label}<small>{cards.length}</small></h2>
        <div className="status-session-list">{cards.length ? cards.map(card => <button type="button" key={card.session_id}
          aria-label={`Open session: ${card.title}`} onClick={() => { setOpen(false); onSelect(card.session_id); }}>
          <HarnessIcon source={card.source} className="w-4 h-4" /><span><strong>{card.title}</strong>
            <small>{SESSION_SOURCE_NAMES[card.source]} · {card.agent?.name ?? "Agent"} · {card.directory_name}{card.parent_id ? " · Subagent" : ""}</small></span>
          <i data-column={card.column}>{card.stage}</i>
        </button>) : <p>No sessions here.</p>}</div>
      </div>
    </div>}
  </div>;
}
