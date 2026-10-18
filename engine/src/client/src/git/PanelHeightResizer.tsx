import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function PanelHeightResizer({ label, storageKey, target, remaining, container, minimum }: {
  label: string; storageKey: string; target: RefObject<HTMLElement | null>; remaining: RefObject<HTMLElement | null>;
  container: RefObject<HTMLElement | null>; minimum: number;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const preferred = useRef<number | null>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [bounds, setBounds] = useState({ height: minimum, maximum: minimum });
  const measure = () => {
    if (!target.current || !remaining.current || !container.current) return null;
    const height = target.current.getBoundingClientRect().height;
    // Keep the history search and a commit row usable when the lower pane grows.
    const reserve = Math.max(140, parseFloat(getComputedStyle(remaining.current).minHeight) || 0);
    const overflow = Math.max(0, container.current.scrollHeight - container.current.clientHeight);
    const maximum = Math.max(minimum, Math.floor(height + remaining.current.getBoundingClientRect().height - reserve - overflow));
    return { height, maximum };
  };
  const layout = () => {
    const measured = measure(); if (!measured || !target.current) return;
    const height = preferred.current === null ? measured.height : Math.max(minimum, Math.min(measured.maximum, preferred.current));
    if (preferred.current !== null) {
      target.current.style.maxHeight = "none";
      target.current.style.height = `${height}px`;
    }
    const next = { height: Math.round(height), maximum: measured.maximum };
    setBounds(previous => previous.height === next.height && previous.maximum === next.maximum ? previous : next);
  };
  const apply = (height: number) => {
    const measured = measure(); if (!measured) return;
    preferred.current = Math.round(Math.max(minimum, Math.min(measured.maximum, height)));
    layout();
  };
  const save = () => {
    try { if (preferred.current !== null) localStorage.setItem(storageKey, String(preferred.current)); } catch { /* storage unavailable */ }
  };
  const stop = () => {
    if (!drag.current) return;
    drag.current = null;
    if (container.current) delete container.current.dataset.heightResizing;
    if (handle.current) delete handle.current.dataset.resizing;
    save();
  };
  useLayoutEffect(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      preferred.current = Number.isFinite(stored) && stored >= minimum && stored <= 10_000 ? stored : null;
    } catch { preferred.current = null; }
    layout();
    const observer = new ResizeObserver(layout);
    for (const element of [target.current, remaining.current, container.current]) if (element) observer.observe(element);
    return () => { observer.disconnect(); stop(); };
  }, [storageKey, minimum, target, remaining, container]);
  return <div ref={handle} className="git-height-resizer" role="separator" tabIndex={0} aria-label={label} aria-orientation="horizontal"
    aria-valuemin={minimum} aria-valuemax={bounds.maximum} aria-valuenow={bounds.height}
    onPointerDown={event => {
      if (event.button !== 0 || !target.current) return;
      drag.current = { y: event.clientY, height: target.current.getBoundingClientRect().height };
      if (container.current) container.current.dataset.heightResizing = "true";
      event.currentTarget.dataset.resizing = "true";
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
    }} onPointerMove={event => {
      if (drag.current) apply(drag.current.height + drag.current.y - event.clientY);
    }} onPointerUp={event => {
      stop(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      apply((target.current?.getBoundingClientRect().height ?? minimum) + (event.key === "ArrowUp" ? 20 : -20)); save();
    }} />;
}
