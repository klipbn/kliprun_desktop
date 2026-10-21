import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowUpToLine, Bold, Copy, Highlighter, Italic, Link, List, ListOrdered, Palette, Redo2, RemoveFormatting, Strikethrough, Trash2, Underline, Undo2, Unlink, X } from "lucide-react";
import { annotateSource, applySplices, createSourceModel, detach, duplicateElement, removeElement, replaceInner, retagElement, setElementStyle, TEXT_BLOCKS, type SourceEdit, type SourceModel, type Splice } from "./htmlSourceMap";
import { visualEditScript } from "./htmlVisualScript";
import { LIVE_PREVIEW_LIMIT, StaleNotice } from "./HTMLPreview";

// Same opaque-origin sandbox and CSP as the read-only preview; the editing script is inline.
const POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const HISTORY_LIMIT = 100;
const HISTORY_BYTES = 64 * 1024 * 1024;
const BLOCK_LABELS: Record<string, string> = { p: "Paragraph", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", blockquote: "Quote", pre: "Preformatted", div: "Block" };

export interface SourceRange { from: number; to: number }
/** The exact replacement that turned `before` into the new content, so the code editor need not diff 40 MB. */
export interface SourceChange { before: string; from: number; to: number; insert: string }
export interface HTMLVisualEditorHandle { flush(): Promise<void> }
interface Selection { id: string | null; tag: string | null; editing: boolean; hasParent: boolean; block: boolean; lists: boolean }
interface Props {
  content: string;
  onChange: (content: string, change?: SourceChange) => void;
  onSave: () => void;
  /** Called with the selected element's source range in `content`. */
  onReveal?: (range: SourceRange | null, content: string) => void;
  ref?: Ref<HTMLVisualEditorHandle>;
}
type VisualMessage = { op: "inner"; id: string; html: string; expected: string[] } | { op: "remove"; id: string; expected: string[] } | { op: "duplicate"; id: string; pairs: [string, string][] }
  | { op: "retag"; id: string; tag: string } | { op: "style"; id: string; property: string; value: string };

const NO_SELECTION: Selection = { id: null, tag: null, editing: false, hasParent: false, block: false, lists: false };
const historySize = (entry: Splice[]) => entry.reduce((total, splice) => total + splice.text.length, 0);

/** The preview document: the annotated source with the CSP right after any doctype, then the editing script. */
export function visualFrameDocument(model: SourceModel, scroll: [number, number] = [0, 0]) {
  const annotated = annotateSource(model);
  const doctype = /^﻿?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i.exec(annotated.slice(0, 8192))?.[0].length ?? 0;
  // Each report of typed text copies the whole source, so large pages report after a longer pause.
  const delay = model.source.length > LIVE_PREVIEW_LIMIT ? 800 : 150;
  return `${annotated.slice(0, doctype)}<meta http-equiv="Content-Security-Policy" content="${POLICY}">${annotated.slice(doctype)}<script>${visualEditScript(scroll, delay)}</script>`;
}

export function HTMLVisualEditor({ content, onChange, onSave, onReveal, ref }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const model = useRef<SourceModel | null>(null);
  const emitted = useRef<string | null>(null);
  const undoStack = useRef<Splice[][]>([]);
  const redoStack = useRef<Splice[][]>([]);
  const scroll = useRef<[number, number]>([0, 0]);
  const flushes = useRef(new Map<number, () => void>());
  const latest = useRef({ onChange, onSave, onReveal }); latest.current = { onChange, onSave, onReveal };
  const [frameDocument, setFrameDocument] = useState("");
  const [generation, setGeneration] = useState(0);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  // The source changed elsewhere and the page in the frame no longer matches the model.
  const [stale, setStale] = useState(false);
  const staleRef = useRef(false);

  const post = (message: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ kliprunVisual: true, ...message }, "*");
  const syncHistory = () => setHistory({ undo: undoStack.current.length > 0, redo: redoStack.current.length > 0 });
  const load = (source: string) => {
    staleRef.current = false; setStale(false);
    try {
      model.current = createSourceModel(source);
      setFrameDocument(visualFrameDocument(model.current, scroll.current));
      setGeneration(value => value + 1);
      setSelection(NO_SELECTION);
    } catch (reason) {
      model.current = null;
      setError(reason instanceof Error ? reason.message : "Unable to read this HTML.");
    }
  };
  const reveal = (current: Selection) => {
    const range = current.id ? model.current?.ranges.get(current.id) : undefined;
    if (!model.current) return;
    if (!range) { latest.current.onReveal?.(null, model.current.source); return; }
    latest.current.onReveal?.(current.editing ? { from: range.openEnd, to: range.closeStart } : { from: range.start, to: range.end }, model.current.source);
  };
  const emit = (source: string, before?: string, undo?: Splice[]) => {
    emitted.current = source;
    const splice = undo?.length === 1 ? undo[0] : undefined;
    latest.current.onChange(source, splice && before !== undefined ? { before, from: splice.from, to: splice.from + splice.text.length, insert: detach(source.slice(splice.from, splice.to)) } : undefined);
  };

  // Our own edits come back as `content`; anything else (code edits, reloads) rebuilds the preview.
  useEffect(() => {
    if (content === emitted.current) return;
    const first = emitted.current === null;
    emitted.current = content;
    undoStack.current = []; redoStack.current = []; syncHistory();
    if (first) { load(content); return; }
    // Edits still arriving from the old page would overwrite the new source, so they are dropped.
    staleRef.current = true; setStale(true);
    post({ type: "command", command: "deselect" });
    if (content.length > LIVE_PREVIEW_LIMIT) return;
    const timeout = setTimeout(() => load(content), 300);
    return () => clearTimeout(timeout);
  }, [content]);

  const apply = (message: VisualMessage) => {
    const current = model.current;
    if (!current || staleRef.current) return;
    const before = current.source;
    const result: SourceEdit = message.op === "inner" ? replaceInner(current, message.id, message.html, message.expected)
      : message.op === "remove" ? removeElement(current, message.id, message.expected)
      : message.op === "duplicate" ? duplicateElement(current, message.id, message.pairs)
      : message.op === "retag" ? retagElement(current, message.id, message.tag)
      : setElementStyle(current, message.id, message.property, message.value);
    if (!result.ok) {
      // The preview already shows the change; rebuild it from the unchanged source.
      setError(result.error);
      load(current.source);
      return;
    }
    if (!result.undo.length) return;
    const entry = [...result.undo].reverse();
    undoStack.current.push(entry);
    let size = undoStack.current.reduce((total, item) => total + historySize(item), 0);
    while (undoStack.current.length > HISTORY_LIMIT || (size > HISTORY_BYTES && undoStack.current.length > 1)) size -= historySize(undoStack.current.shift()!);
    redoStack.current = [];
    syncHistory(); setError(null);
    emit(current.source, before, result.undo);
    reveal(selectionRef.current);
  };
  const travel = (from: typeof undoStack, to: typeof undoStack) => {
    if (staleRef.current) return;
    const entry = from.current.pop();
    if (!entry || !model.current) return;
    const { source, inverse } = applySplices(model.current.source, entry);
    to.current.push(inverse);
    syncHistory();
    load(source);
    emit(source);
    const changed = inverse[0];
    latest.current.onReveal?.(changed ? { from: changed.from, to: changed.from } : null, source);
  };
  const undo = () => travel(undoStack, redoStack);
  const redo = () => travel(redoStack, undoStack);
  const travelRef = useRef({ undo, redo }); travelRef.current = { undo, redo };

  useImperativeHandle(ref, () => ({
    // Waits until text typed in the preview reaches the source, so Save writes it.
    flush: () => new Promise<void>(resolve => {
      const token = Math.random();
      const timeout = setTimeout(() => { flushes.current.delete(token); resolve(); }, 500);
      flushes.current.set(token, () => { clearTimeout(timeout); resolve(); });
      post({ type: "flush", token });
    }),
  }), []);

  const applyRef = useRef(apply); applyRef.current = apply;
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.kliprunVisual !== true) return;
      const data = event.data;
      if (data.type === "op") applyRef.current(data.op as VisualMessage);
      else if (data.type === "selection") {
        const next: Selection = { id: data.id, tag: data.tag, editing: !!data.editing, hasParent: !!data.hasParent, block: !!data.block, lists: !!data.lists };
        setSelection(next); selectionRef.current = next;
        if (!next.editing) setLink(null);
        reveal(next);
      }
      else if (data.type === "notice") setError(String(data.text));
      else if (data.type === "scroll") scroll.current = [Number(data.x) || 0, Number(data.y) || 0];
      else if (data.type === "save") latest.current.onSave();
      else if (data.type === "undo") travelRef.current.undo();
      else if (data.type === "redo") travelRef.current.redo();
      else if (data.type === "flushed") { flushes.current.get(data.token)?.(); flushes.current.delete(data.token); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const command = (name: string, value?: string) => post({ type: "command", command: name, value });
  const format = (name: string, value?: string) => command("format", value === undefined ? name : `${name}:${value}`);
  const { editing } = selection, selected = !!selection.tag;
  const tool = (label: string, icon: ReactNode, onClick: () => void, enabled: boolean, shortcut?: string) =>
    <button type="button" className="git-icon-button" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} disabled={!enabled}
      onMouseDown={event => event.preventDefault()} onClick={onClick}>{icon}</button>;
  const hint = !selected ? "Click an element to select it, click it again to edit its text"
    : editing ? `Editing <${selection.tag}> · Esc to finish` : `<${selection.tag}> selected · click again or Enter to edit · Delete removes`;

  return <div className="repository-visual-editor">
    <div className="repository-visual-toolbar" role="toolbar" aria-label="Visual HTML editing">
      <select className="repository-visual-block" aria-label="Block type" disabled={!selection.block} value={selection.block ? selection.tag ?? "" : ""}
        onChange={event => command("retag", event.target.value)}>
        {!selection.block && <option value="">Block type</option>}
        {TEXT_BLOCKS.map(tag => <option key={tag} value={tag}>{BLOCK_LABELS[tag]}</option>)}
      </select>
      <span className="repository-visual-separator" />
      {tool("Bold", <Bold size={14} />, () => format("bold"), editing, "⌘B")}
      {tool("Italic", <Italic size={14} />, () => format("italic"), editing, "⌘I")}
      {tool("Underline", <Underline size={14} />, () => format("underline"), editing, "⌘U")}
      {tool("Strikethrough", <Strikethrough size={14} />, () => format("strikeThrough"), editing)}
      {tool("Bulleted list", <List size={14} />, () => format("insertUnorderedList"), editing && selection.lists)}
      {tool("Numbered list", <ListOrdered size={14} />, () => format("insertOrderedList"), editing && selection.lists)}
      {tool("Link", <Link size={14} />, () => setLink(""), editing)}
      {tool("Remove link", <Unlink size={14} />, () => format("unlink"), editing)}
      {tool("Clear formatting", <RemoveFormatting size={14} />, () => format("removeFormat"), editing)}
      <span className="repository-visual-separator" />
      <ColorTool label="Text color" icon={<Palette size={14} />} enabled={selected} onPick={color => command("style", `color=${color}`)} />
      <ColorTool label="Background color" icon={<Highlighter size={14} />} enabled={selected} onPick={color => command("style", `background-color=${color}`)} />
      <span className="repository-visual-separator" />
      {tool("Select parent block", <ArrowUpToLine size={14} />, () => command("parent"), selected && selection.hasParent)}
      {tool("Duplicate block", <Copy size={14} />, () => command("duplicate"), selected, "⌘D")}
      {tool("Delete block", <Trash2 size={14} />, () => command("delete"), selected, "Delete")}
      <span className="repository-visual-separator" />
      {tool("Undo visual edit", <Undo2 size={14} />, undo, history.undo, "⌘Z")}
      {tool("Redo visual edit", <Redo2 size={14} />, redo, history.redo, "⇧⌘Z")}
      <span className="repository-visual-hint" title={hint}>{hint}</span>
    </div>
    {link !== null && <form className="repository-visual-link" onSubmit={event => {
      event.preventDefault();
      const url = link.trim();
      if (url && !/^\s*(javascript|data|vbscript):/i.test(url)) format("createLink", url);
      setLink(null);
    }}>
      <input autoFocus aria-label="Link address" placeholder="https://example.com" value={link} onChange={event => setLink(event.target.value)}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setLink(null); } }} />
      <button type="submit" className="git-button">Add link</button>
      <button type="button" className="git-icon-button" aria-label="Cancel link" onClick={() => setLink(null)}><X size={14} /></button>
    </form>}
    {error && <p className="git-feedback is-error repository-visual-error" role="alert">{error}<button type="button" className="git-icon-button" aria-label="Dismiss" onClick={() => setError(null)}><X size={12} /></button></p>}
    {stale && content.length > LIVE_PREVIEW_LIMIT && <StaleNotice label="The source changed in the code editor. Refresh the page to keep editing it visually." onRefresh={() => load(content)} />}
    <div className="repository-visual-frame">
      <iframe ref={frame} key={generation} className="repository-html-preview" title="HTML visual editor" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={frameDocument} />
      {stale && <div className="repository-visual-blocker" aria-hidden="true" />}
    </div>
  </div>;
}

/** A toolbar button that opens the system color picker and applies the color once it is chosen. */
function ColorTool({ label, icon, enabled, onPick }: { label: string; icon: ReactNode; enabled: boolean; onPick: (color: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick); pick.current = onPick;
  useEffect(() => {
    const element = input.current;
    const change = () => { if (element) pick.current(element.value); };
    element?.addEventListener("change", change);
    return () => element?.removeEventListener("change", change);
  }, []);
  return <label className={`git-icon-button repository-visual-color${enabled ? "" : " is-disabled"}`} title={label} onMouseDown={event => { if (!enabled) event.preventDefault(); }}>
    {icon}
    <input ref={input} type="color" aria-label={label} disabled={!enabled} defaultValue="#d62828" />
  </label>;
}
