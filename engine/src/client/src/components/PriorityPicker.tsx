import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, CircleAlert, CircleHelp, Flag, Zap } from "lucide-react";
import type { CardPriority } from "../cardPriorities";

const PRIORITY_OPTIONS: { value: CardPriority | null; label: string; icon: typeof Flag; color: string }[] = [
  { value: "critical", label: "Critical", icon: Flag, color: "text-error" },
  { value: "medium", label: "Medium", icon: Flag, color: "text-warning" },
  { value: "low", label: "Low", icon: Flag, color: "text-success" },
  { value: "question", label: "Question", icon: CircleHelp, color: "text-accent" },
  { value: "warning", label: "Warning", icon: CircleAlert, color: "text-warning" },
  { value: "urgent", label: "Urgent", icon: Zap, color: "text-warning" },
  { value: "blocked", label: "Blocked", icon: Ban, color: "text-error" },
  { value: null, label: "No priority", icon: Flag, color: "text-text-secondary" },
];

export function PriorityPicker({ title, priority, onChange }: {
  title: string;
  priority: CardPriority | null;
  onChange: (priority: CardPriority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = PRIORITY_OPTIONS.find(option => option.value === priority) ?? PRIORITY_OPTIONS[PRIORITY_OPTIONS.length - 1];

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };

  const place = () => {
    const anchor = trigger.current?.getBoundingClientRect();
    const menu = popup.current?.getBoundingClientRect();
    if (!anchor || !menu) return;
    const left = Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8));
    const below = anchor.bottom + 4;
    const top = below + menu.height <= window.innerHeight - 8
      ? below
      : Math.max(8, anchor.top - menu.height - 4);
    setPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    (popup.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? popup.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const reposition = () => place();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-label={`Priority for ${title}`} title={`${selected.label}. Click to change.`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} data-testid="card-priority"
      data-priority={priority ?? "none"}
      onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-border/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${selected.color}`}>
      <selected.icon className="h-3.5 w-3.5" fill={priority === "critical" || priority === "medium" || priority === "low" ? "currentColor" : "none"}
        aria-hidden="true" data-testid="card-priority-icon" />
    </button>
    {open && createPortal(<div ref={popup} id={id} role="menu" aria-label={`Priority for ${title}`}
      className="fixed z-[100] w-48 max-h-[calc(100vh-16px)] overflow-auto rounded-md border border-border bg-surface p-1 text-xs text-text-primary shadow-xl"
      style={position ?? { left: -10000, top: 0 }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(true); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
      }}>
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Priority</div>
      {PRIORITY_OPTIONS.map((option, index) => {
        const Icon = option.icon;
        const checked = option.value === priority;
        return <Fragment key={option.label}>
          {index === PRIORITY_OPTIONS.length - 1 && <div role="separator" className="my-1 border-t border-border" />}
          <button type="button" role="menuitemradio" aria-checked={checked} title={option.label}
            data-priority-option={option.value ?? "none"}
            onClick={event => { event.stopPropagation(); close(true); onChange(option.value); }}
            className={`flex min-h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${checked ? "bg-background" : ""}`}>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${option.color}`} fill={option.value === "critical" || option.value === "medium" || option.value === "low" ? "currentColor" : "none"}
              aria-hidden="true" />
            <span className="min-w-0 flex-1">{option.label}</span>
            {checked && <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
          </button>
        </Fragment>;
      })}
    </div>, document.body)}
  </>;
}
