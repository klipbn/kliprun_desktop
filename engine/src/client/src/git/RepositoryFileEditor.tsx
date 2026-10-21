import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, Columns2, Eye, EyeOff, FileDiff, MousePointerClick, Save } from "lucide-react";
import type { GitFileBase } from "@shared/git";
import { Annotation, Compartment, EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { openSearchPanel, findNext, findPrevious, getSearchQuery } from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createRepositoryEditorState, minimalChange, repositoryFileLanguage, repositoryIndentUnit } from "./repositoryCodeEditor";
import { NotebookPreview } from "./NotebookPreview";
import { HTMLPreview } from "./HTMLPreview";
import { linkedElement, setLinkedElement } from "./repositoryLongLines";
import { HTMLVisualEditor, type HTMLVisualEditorHandle, type SourceChange, type SourceRange } from "./HTMLVisualEditor";
import { useGitRequest } from "./useGitRequest";
import { expandRepositoryGitHunks, repositoryGitDiff, repositoryGitState, repositoryGitSummary, setRepositoryGitBase } from "./repositoryGitDiff";
import "./repositoryFileEditor.css";

export interface RepositoryFileEditorProps {
  path: string;
  directory?: string;
  head?: string | null;
  refresh?: number;
  active?: boolean;
  content: string;
  savedContent: string;
  saving: boolean;
  savedAt?: number;
  error?: string | null;
  onChange: (content: string) => void;
  onSave: () => void;
}

const externalContent = Annotation.define<boolean>();
const LARGE_SOURCE = 2 * 1024 * 1024;

export function RepositoryFileEditor(props: RepositoryFileEditorProps) {
  const { path, directory, head, refresh = 0, active = true, content, savedContent, saving, savedAt = 0, error } = props;
  const baseline = useGitRequest<GitFileBase>(directory && active ? `/api/git/file-base?${new URLSearchParams({ directory, path, head: head ?? "" })}` : null, refresh);
  const [base, setBase] = useState<GitFileBase | null>(null);
  const latestBase = useRef(base); latestBase.current = base;
  const [review, setReview] = useState({ hunks: 0, additions: 0, deletions: 0, expanded: 0, limited: false });
  const current = useRef(props);
  current.current = props;
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // Reports up to 40 MB are too heavy for the code editor, so they open as a rendered page.
  const largeHtml = /\.html?$/i.test(path) && content.length > LARGE_SOURCE;
  const [preview, setPreview] = useState(() => /\.ipynb$/i.test(path) || largeHtml);
  const [sourceOpened, setSourceOpened] = useState(() => !/\.ipynb$/i.test(path) && !largeHtml);
  const [visual, setVisual] = useState(false);
  // HTML previews show the source beside them; selecting in the preview selects the code.
  const [split, setSplit] = useState(() => !largeHtml);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [resizing, setResizing] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const visualEditor = useRef<HTMLVisualEditorHandle>(null);
  const editorContent = useRef<string | null>(null);
  const changeHint = useRef<SourceChange & { after: string } | null>(null);
  const pendingReveal = useRef<{ range: SourceRange | null; content: string } | null>(null);
  const pendingFind = useRef(false);
  const [showSaved, setShowSaved] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [indentation, setIndentation] = useState(() => repositoryIndentUnit(path, content));
  const dirty = content !== savedContent;
  const language = repositoryFileLanguage(path);
  const markdown = language === "Markdown";
  const notebook = language === "Jupyter Notebook";
  const html = language === "HTML";
  const previewLabel = html ? preview ? "Edit HTML" : "Preview HTML" : notebook ? preview ? "Edit notebook JSON" : "Preview notebook" : preview ? "Edit Markdown" : "Preview Markdown";
  const splitView = html && preview && split;
  const showSource = !preview || splitView;

  const showPendingRange = () => {
    const pending = pendingReveal.current, editor = view.current;
    if (!pending || !editor || editorContent.current !== pending.content) return;
    pendingReveal.current = null;
    if (!pending.range) { editor.dispatch({ effects: setLinkedElement.of(null) }); return; }
    const length = editor.state.doc.length, to = Math.min(pending.range.to, length), from = Math.min(pending.range.from, to);
    editor.dispatch({ selection: EditorSelection.cursor(from), effects: [setLinkedElement.of({ from, to }), EditorView.scrollIntoView(from, { y: "center" })] });
  };
  const revealSource = (range: SourceRange | null, source: string) => { pendingReveal.current = { range, content: source }; showPendingRange(); };
  // Copying a large document into the draft on every keystroke allocates its full size each time,
  // so large files report typing after a pause, or at once before anything that reads the draft.
  const pendingEdit = useRef(0);
  const flushEditorChange = () => {
    if (!pendingEdit.current) return;
    clearTimeout(pendingEdit.current); pendingEdit.current = 0;
    document.removeEventListener("pointerdown", flushOnAction, true);
    document.removeEventListener("keydown", flushOnShortcut, true);
    window.removeEventListener("kliprun:menu-command", flushOnAction, true);
    const editor = view.current;
    if (!editor) return;
    editorContent.current = editor.state.sliceDoc();
    current.current.onChange(editorContent.current);
  };
  const flushRef = useRef(flushEditorChange); flushRef.current = flushEditorChange;
  const flushOnAction = useRef(() => flushRef.current()).current;
  const flushOnShortcut = useRef((event: KeyboardEvent) => { if (event.metaKey || event.ctrlKey || event.altKey) flushRef.current(); }).current;
  const scheduleEditorChange = () => {
    if (!pendingEdit.current) {
      document.addEventListener("pointerdown", flushOnAction, true);
      document.addEventListener("keydown", flushOnShortcut, true);
      window.addEventListener("kliprun:menu-command", flushOnAction, true);
    }
    clearTimeout(pendingEdit.current);
    pendingEdit.current = window.setTimeout(() => flushRef.current(), 1000);
  };
  const save = async () => {
    flushEditorChange();
    // Text typed in the visual editor reaches the source a moment later; include it.
    if (visual && visualEditor.current) await visualEditor.current.flush();
    if (!current.current.saving) current.current.onSave();
  };
  const saveRef = useRef(save); saveRef.current = save;

  const publishHistory = (state: EditorState) => {
    if (!root.current) return;
    root.current.dataset.menuUndo = String(!current.current.saving && undoDepth(state) > 0);
    root.current.dataset.menuRedo = String(!current.current.saving && redoDepth(state) > 0);
    root.current.dataset.menuSearch = String(!!getSearchQuery(state).search);
  };
  useEffect(() => {
    if (!host.current || !sourceOpened) return;
    const canEdit = (locked: boolean) => [EditorState.readOnly.of(locked), EditorView.editable.of(!locked),
      EditorView.contentAttributes.of({ "aria-label": `Edit ${path}`, "aria-readonly": String(locked), spellcheck: "false" })];
    const editor = new EditorView({
      parent: host.current,
      state: createRepositoryEditorState(path, current.current.content, [
        repositoryGitDiff,
        linkedElement,
        editable.current.of(canEdit(current.current.saving)),
        keymap.of([{ key: "Mod-s", run: () => { void saveRef.current(); return true; } }]),
        EditorView.updateListener.of(update => {
          publishHistory(update.state);
          if (update.startState.field(repositoryGitState) !== update.state.field(repositoryGitState)) setReview(repositoryGitSummary(update.state));
          if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalContent))) {
            if (update.state.doc.length > LARGE_SOURCE) scheduleEditorChange();
            else {
              editorContent.current = update.state.sliceDoc();
              current.current.onChange(editorContent.current);
            }
          }
          if (update.docChanged || update.selectionSet) {
            const cursor = update.state.selection.main.head;
            const line = update.state.doc.lineAt(cursor);
            setPosition({ line: line.number, column: cursor - line.from + 1 });
          }
        }),
      ]),
    });
    view.current = editor;
    editorContent.current = current.current.content;
    editor.dispatch({ effects: setRepositoryGitBase.of(latestBase.current?.content ?? null) });
    publishHistory(editor.state);
    const menu = (event: Event) => {
      if (!root.current?.getClientRects().length || root.current.closest('[hidden]')) return;
      const command = (event as CustomEvent<string>).detail;
      if (command === 'undo' && !current.current.saving) { undo(editor); editor.focus(); }
      else if (command === 'redo' && !current.current.saving) { redo(editor); editor.focus(); }
      else if (command === 'find') { setPreview(false); openSearchPanel(editor); requestAnimationFrame(() => editor.dom.querySelector<HTMLInputElement>('.cm-search input[name=search]')?.focus()); }
      else if (command === 'find-next') findNext(editor);
      else if (command === 'find-previous') findPrevious(editor);
      publishHistory(editor.state);
    };
    const element = root.current;
    element?.addEventListener('kliprun:editor-command', menu);
    setIndentation(repositoryIndentUnit(path, current.current.content));
    setPosition({ line: 1, column: 1 });
    if (pendingFind.current) {
      pendingFind.current = false;
      openSearchPanel(editor);
      requestAnimationFrame(() => editor.dom.querySelector<HTMLInputElement>('.cm-search input[name=search]')?.focus());
    }
    showPendingRange();
    return () => { flushRef.current(); element?.removeEventListener('kliprun:editor-command', menu); editor.destroy(); view.current = null; editorContent.current = null; };
  }, [path, sourceOpened]);

  useEffect(() => {
    if (baseline.data) {
      setBase(baseline.data);
      view.current?.dispatch({ effects: setRepositoryGitBase.of(baseline.data.content) });
    } else if (baseline.error) {
      setBase(null); view.current?.dispatch({ effects: setRepositoryGitBase.of(null) });
    }
  }, [baseline.data, baseline.error]);

  useEffect(() => {
    setBase(null); view.current?.dispatch({ effects: setRepositoryGitBase.of(null) });
  }, [head]);

  useEffect(() => {
    const element = root.current;
    const find = (event: Event) => {
      if (view.current || !element?.getClientRects().length || element.closest('[hidden]')) return;
      if ((event as CustomEvent<string>).detail === "find") { pendingFind.current = true; setSourceOpened(true); setPreview(false); }
    };
    element?.addEventListener("kliprun:editor-command", find);
    return () => element?.removeEventListener("kliprun:editor-command", find);
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    // Unreported typing is newer than this content; report it instead of overwriting it.
    if (pendingEdit.current) { flushEditorChange(); return; }
    if (editorContent.current !== content) {
      // Replace only what changed, so large files, scroll position and diff markers stay put.
      const hint = changeHint.current, previous = editorContent.current ?? editor.state.sliceDoc();
      changeHint.current = null;
      const change = hint && hint.after === content && hint.before === previous ? { from: hint.from, to: hint.to, insert: hint.insert } : minimalChange(previous, content);
      editorContent.current = content;
      if (change) editor.dispatch({ changes: change, annotations: [externalContent.of(true), Transaction.addToHistory.of(false)] });
    }
    showPendingRange();
  }, [content]);

  useEffect(() => { if (splitView) setSourceOpened(true); }, [splitView]);
  useEffect(() => { flushEditorChange(); }, [preview, visual, split]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure([
      EditorState.readOnly.of(saving), EditorView.editable.of(!saving),
      EditorView.contentAttributes.of({ "aria-label": `Edit ${path}`, "aria-readonly": String(saving), spellcheck: "false" }),
    ]) });
  }, [saving, path]);

  useEffect(() => {
    if (showSource) view.current?.requestMeasure();
  }, [showSource, splitRatio]);

  useEffect(() => {
    setShowSaved(savedAt > 0);
    if (!savedAt) return;
    const timeout = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [savedAt]);

  return <div ref={root} className="repository-file-editor" onKeyDown={event => {
    if (!event.defaultPrevented && event.key === "Escape" && review.expanded) {
      event.preventDefault(); view.current?.dispatch({ effects: expandRepositoryGitHunks.of("none") }); view.current?.focus();
    }
    if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (!saving) void save();
    }
  }}>
    <div className="repository-editor-toolbar">
      <nav className="repository-editor-breadcrumbs" aria-label="File path" title={path}>
        {path.split("/").map((part, index, parts) => <Fragment key={index}>
          {index > 0 && <ChevronRight size={11} aria-hidden="true" />}
          <span className={index === parts.length - 1 ? "repository-breadcrumb-current" : undefined}>{part}</span>
        </Fragment>)}
      </nav>
      {dirty && <span className="repository-editor-dirty" aria-label="Unsaved changes">Unsaved</span>}
      <span className="repository-editor-feedback" role="status">{saving ? "Saving…" : showSaved && !dirty && !error ? "Saved" : ""}</span>
      {directory && <>
        {review.hunks > 0 && <span className="repository-editor-change-count" aria-label={`${review.additions} added lines, ${review.deletions} deleted lines`}><span>+{review.additions}</span><span>−{review.deletions}</span></span>}
        <button type="button" className="git-icon-button" aria-label={review.expanded ? "Hide changes" : "Show changes"} title={review.expanded ? "Hide changes (Esc)" : "Show changes compared with HEAD"} aria-pressed={review.expanded > 0}
          disabled={preview || !review.hunks} onClick={() => view.current?.dispatch({ effects: expandRepositoryGitHunks.of(review.expanded ? "none" : "all") })}><FileDiff size={14} /></button>
      </>}
      {(markdown || notebook || html) && <button type="button" className="git-icon-button" aria-label={previewLabel} title={previewLabel} aria-pressed={preview} onClick={() => { setSourceOpened(true); setVisual(false); setPreview(value => !value); }}>{preview ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
      {html && <button type="button" className="git-icon-button" aria-label={visual ? "Stop visual editing" : "Edit page visually"} title={visual ? "Stop visual editing" : "Edit page visually: select text or blocks, then save with ⌘S"} aria-pressed={visual} onClick={() => { setPreview(true); setVisual(value => !value); }}><MousePointerClick size={14} /></button>}
      {html && preview && <button type="button" className="git-icon-button" aria-label={split ? "Hide source" : "Show source beside preview"} title={split ? "Hide source" : "Show source beside preview"} aria-pressed={split} onClick={() => setSplit(value => !value)}><Columns2 size={14} /></button>}
      <button type="button" className="git-icon-button repository-editor-save" disabled={!dirty || saving} aria-label="Save file" title="Save (⌘S / Ctrl+S)" onClick={() => void save()}><Save size={14} /></button>
    </div>
    {error && <p className="git-feedback is-error" role="alert">{error}</p>}
    <div ref={body} className={`repository-editor-body${splitView ? " is-split" : ""}${resizing ? " is-resizing" : ""}`} style={{ "--repository-split": `${splitRatio * 100}%` } as CSSProperties}>
    <div className="repository-code-editor" ref={host} hidden={!showSource} />
    {splitView && <div className="repository-split-handle" role="separator" aria-orientation="vertical" aria-label="Resize preview and source" tabIndex={0}
      aria-valuenow={Math.round(splitRatio * 100)} aria-valuemin={20} aria-valuemax={80}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplitRatio(value => Math.min(0.8, Math.max(0.2, value + (event.key === "ArrowLeft" ? -0.05 : 0.05)))); } }}
      onPointerDown={event => {
        const bounds = body.current?.getBoundingClientRect();
        if (!bounds) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        setResizing(true);
        const move = (next: PointerEvent) => setSplitRatio(Math.min(0.8, Math.max(0.2, (next.clientX - bounds.left) / bounds.width)));
        const stop = () => { setResizing(false); handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", stop); handle.removeEventListener("pointercancel", stop); };
        handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", stop); handle.addEventListener("pointercancel", stop);
      }} />}
    {preview && html && active && !visual && <HTMLPreview content={content} />}
    {preview && html && active && visual && <HTMLVisualEditor ref={visualEditor} content={content} onChange={(value, change) => { changeHint.current = change && view.current ? { ...change, after: value } : null; current.current.onChange(value); }} onSave={() => void save()} onReveal={revealSource} />}
    {preview && notebook && <NotebookPreview content={content} />}
    {preview && markdown && <div className="repository-markdown-preview" aria-label="Markdown preview" tabIndex={0}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        img: ({ alt }) => <span className="repository-markdown-image">[Image: {alt || "image"}]</span>,
        a: ({ children }) => <span className="repository-markdown-link">{children}</span>,
      }}>{content}</Markdown>
    </div>}
    </div>
    <footer className="repository-editor-statusbar">
      {(baseline.error || base?.notice || review.limited) && <span className="repository-git-notice" title={baseline.error ?? base?.notice ?? "Git diff is too large to display"}>{baseline.error ? "Git changes unavailable" : base?.notice ?? "Git diff is too large to display"}</span>}
      <span aria-label="Cursor position">Ln {position.line}, Col {position.column}</span>
      <span>{indentation === "\t" ? "Tabs: 4" : `Spaces: ${indentation.length}`}</span>
      <span>UTF-8</span>
      <span>{language}</span>
    </footer>
  </div>;
}
