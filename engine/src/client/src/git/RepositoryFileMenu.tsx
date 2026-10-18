import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasDesktopBridge, notifyNativeFileAction } from "../nativeBridge";

export function RepositoryFileMenu({ root, path, folder, expanded, x, y, disabled, onOpen, onToggle, onRename, onIgnore, onError, onClose }: {
  root: string; path: string; folder: boolean; expanded: boolean; x: number; y: number; disabled: boolean;
  onOpen: () => void; onToggle: () => void; onRename: () => void; onIgnore: () => void; onError: (error: string) => void; onClose: (restoreFocus?: boolean) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const rect = popup.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    popup.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const outside = (event: Event) => { if (!popup.current?.contains(event.target as Node)) onClose(); };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true);
    };
  }, [x, y]);
  function run(action: () => void) { onClose(true); action(); }
  async function copy(value: string) {
    if (notifyNativeFileAction("copy", value)) return;
    try { await navigator.clipboard.writeText(value); }
    catch { onError("Unable to copy the path to the clipboard."); }
  }
  function native(action: "open" | "reveal") {
    if (!notifyNativeFileAction(action, `${root}/${path}`)) onError("This action is available in KlipRun Desktop.");
  }
  return createPortal(<div ref={popup} role="menu" aria-label="File actions" className="repository-context-menu" style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  }}>
    <button type="button" role="menuitem" disabled={disabled} onClick={() => run(folder ? onToggle : onOpen)}>{folder ? expanded ? "Collapse Folder" : "Expand Folder" : "Open"}</button>
    <button type="button" role="menuitem" disabled={!hasDesktopBridge()} onClick={() => run(() => native("open"))}>Open in Default App</button>
    <div role="separator" />
    <button type="button" role="menuitem" disabled={disabled} onClick={() => run(onRename)}>Rename</button>
    <button type="button" role="menuitem" onClick={() => run(() => void copy(`${root}/${path}`))}>Copy Path</button>
    <button type="button" role="menuitem" onClick={() => run(() => void copy(path))}>Copy Relative Path</button>
    <button type="button" role="menuitem" disabled={!hasDesktopBridge()} onClick={() => run(() => native("reveal"))}>Reveal in Finder</button>
    <div role="separator" />
    <button type="button" role="menuitem" disabled={disabled} onClick={() => run(onIgnore)}>Add to .gitignore</button>
  </div>, document.body);
}
