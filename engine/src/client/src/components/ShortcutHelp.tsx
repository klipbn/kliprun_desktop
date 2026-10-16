import { useRef } from "react";
import { CircleHelp, X } from "lucide-react";

const groups = [
  { title: "Navigate", shortcuts: [
    ["Kanban board", "⌃ 1"], ["Git", "⌃ 2"], ["Office", "⌃ 3"], ["Usage", "⌃ 4"], ["Statistics", "⌃ 5"],
    ["Settings", "⌘ ,"],
  ] },
  { title: "Terminals", shortcuts: [
    ["Choose a new terminal", "⌘ T"], ["Show or hide terminal", "⌘ J"],
    ["Expand or restore terminal", "⌘ ↩"], ["Select terminal tab 1–9", "⌘ 1–9"],
    ["Rename active tab", "⌘ R"],
    ["Close active terminal", "⌘ W"],
  ] },
  { title: "Agents", shortcuts: [
    ["New OpenCode", "⌘ ⇧ O"], ["New Codex", "⌘ ⇧ C"],
  ] },
  { title: "Zoom", shortcuts: [
    ["Zoom in", "⌘ +"], ["Zoom out", "⌘ −"], ["Actual size", "⌘ 0"],
  ] },
];

export function ShortcutHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} aria-label="Keyboard shortcuts" title="Keyboard shortcuts"
      className="flex items-center justify-center w-8 h-8 rounded-md border border-border text-white hover:text-white hover:border-accent/40 hover:bg-white/10 transition-colors"
      data-testid="keyboard-shortcuts-button">
      <CircleHelp className="w-4 h-4" />
    </button>
    <dialog ref={dialog} aria-labelledby="keyboard-shortcuts-title"
      className="w-full max-w-lg max-h-[85vh] rounded-xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/70">
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <header className="flex items-center justify-between gap-4 mb-4">
          <h2 id="keyboard-shortcuts-title" className="text-base font-semibold">Keyboard shortcuts</h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close keyboard shortcuts"
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-background">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map(group => <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{group.title}</h3>
            <ul className="space-y-2">
              {group.shortcuts.map(([action, keys]) => <li key={action} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-text-secondary">{action}</span>
                <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-1 font-mono text-text-primary">{keys}</kbd>
              </li>)}
            </ul>
          </section>)}
        </div>
        <p className="mt-5 border-t border-border pt-3 text-[11px] text-text-secondary">⌘ Command · ⌃ Control · ⇧ Shift · ↩ Return · Esc closes this window</p>
      </div>
    </dialog>
  </>;
}
