import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Folder, FolderPlus, Inbox, Tag } from "lucide-react";
import type { SessionWorkspace } from "./model";

export interface MoveTarget { projectId: string | null; groupId: string | null }

/** The destination shared by every session in `ids`, or undefined when they differ. */
export function currentTarget(state: SessionWorkspace, ids: string[]): MoveTarget | undefined {
  const targets = ids.map(id => state.assignments[id]).map(assignment => ({ projectId: assignment?.projectId ?? null, groupId: assignment?.groupId ?? null }));
  return targets.every(target => target.projectId === targets[0]?.projectId && target.groupId === targets[0]?.groupId) ? targets[0] : undefined;
}

/** A drop-down beside the folder button that moves sessions with one click. */
export function SessionMoveMenu({ state, ids, anchor, onMove, onNewProject, onClose }: {
  state: SessionWorkspace; ids: string[]; anchor: HTMLElement;
  onMove: (target: MoveTarget) => void; onNewProject: () => void; onClose: (restoreFocus?: boolean) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const current = currentTarget(state, ids);
  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.getBoundingClientRect(), menu = popup.current!.getBoundingClientRect();
      const below = button.bottom + 4, above = button.top - menu.height - 4;
      setPosition({
        left: Math.max(8, Math.min(button.right - menu.width, window.innerWidth - menu.width - 8)),
        top: below + menu.height <= window.innerHeight - 8 || above < 8 ? Math.max(8, Math.min(below, window.innerHeight - menu.height - 8)) : above,
      });
    };
    place();
    (popup.current?.querySelector<HTMLButtonElement>("[aria-checked=true]") ?? popup.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    const outside = (event: Event) => { if (!popup.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose(); };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);
  const item = (key: string, target: MoveTarget, label: string, icon: ReactNode, nested = false) => {
    const checked = current?.projectId === target.projectId && current?.groupId === target.groupId;
    return <button key={key} type="button" role="menuitemradio" aria-checked={checked} className={nested ? "is-nested" : undefined} title={label}
      onClick={() => { onClose(true); if (!checked) onMove(target); }}>
      {icon}<span>{label}</span>{checked && <Check className="sw-move-check" />}
    </button>;
  };
  return createPortal(<div ref={popup} role="menu" aria-label={ids.length === 1 ? "Move session to" : `Move ${ids.length} sessions to`} className="sw-move-menu"
    style={position ?? { left: -9999, top: 0 }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items[next]?.focus();
    }}>
    <div className="sw-move-heading">{ids.length === 1 ? "Move to" : `Move ${ids.length} sessions to`}</div>
    {item("none", { projectId: null, groupId: null }, "No project", <Inbox />)}
    {state.projects.map(project => [
      item(project.id, { projectId: project.id, groupId: null }, project.name, <Folder />),
      ...project.groups.map(group => item(`${project.id}:${group.id}`, { projectId: project.id, groupId: group.id }, group.name, <Tag />, true)),
    ])}
    <div role="separator" />
    <button type="button" role="menuitem" onClick={() => { onClose(); onNewProject(); }}><FolderPlus /><span>New project…</span></button>
    <p className="sw-move-hint">Organization in KlipRun only. Original folders stay the same.</p>
  </div>, document.body);
}
