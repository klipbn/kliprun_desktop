import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight, Eye, EyeOff, Save } from "lucide-react";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createRepositoryEditorState, repositoryFileLanguage, repositoryIndentUnit } from "./repositoryCodeEditor";
import "./repositoryFileEditor.css";

export interface RepositoryFileEditorProps {
  path: string;
  content: string;
  savedContent: string;
  saving: boolean;
  savedAt?: number;
  error?: string | null;
  onChange: (content: string) => void;
  onSave: () => void;
}

const externalContent = Annotation.define<boolean>();

export function RepositoryFileEditor(props: RepositoryFileEditorProps) {
  const { path, content, savedContent, saving, savedAt = 0, error, onSave } = props;
  const current = useRef(props);
  current.current = props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const [preview, setPreview] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [indentation, setIndentation] = useState(() => repositoryIndentUnit(path, content));
  const dirty = content !== savedContent;
  const language = repositoryFileLanguage(path);
  const markdown = language === "Markdown";

  useEffect(() => {
    if (!host.current) return;
    const canEdit = (locked: boolean) => [EditorState.readOnly.of(locked), EditorView.editable.of(!locked),
      EditorView.contentAttributes.of({ "aria-label": `Edit ${path}`, "aria-readonly": String(locked), spellcheck: "false" })];
    const editor = new EditorView({
      parent: host.current,
      state: createRepositoryEditorState(path, current.current.content, [
        editable.current.of(canEdit(current.current.saving)),
        keymap.of([{ key: "Mod-s", run: () => {
          const latest = current.current;
          if (!latest.saving && latest.content !== latest.savedContent) latest.onSave();
          return true;
        } }]),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalContent))) {
            current.current.onChange(update.state.sliceDoc());
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
    setIndentation(repositoryIndentUnit(path, current.current.content));
    setPosition({ line: 1, column: 1 });
    setPreview(false);
    return () => { editor.destroy(); view.current = null; };
  }, [path]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.sliceDoc() === content) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: content },
      annotations: [externalContent.of(true), Transaction.addToHistory.of(false)],
    });
  }, [content]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure([
      EditorState.readOnly.of(saving), EditorView.editable.of(!saving),
      EditorView.contentAttributes.of({ "aria-label": `Edit ${path}`, "aria-readonly": String(saving), spellcheck: "false" }),
    ]) });
  }, [saving, path]);

  useEffect(() => {
    if (!preview) view.current?.requestMeasure();
  }, [preview]);

  useEffect(() => {
    setShowSaved(savedAt > 0);
    if (!savedAt) return;
    const timeout = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [savedAt]);

  return <div className="repository-file-editor" onKeyDown={event => {
    if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (dirty && !saving) onSave();
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
      {markdown && <button type="button" className="git-icon-button" aria-label={preview ? "Edit Markdown" : "Preview Markdown"} title={preview ? "Edit Markdown" : "Preview Markdown"} aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
      <button type="button" className="git-icon-button repository-editor-save" disabled={!dirty || saving} aria-label="Save file" title="Save (⌘S / Ctrl+S)" onClick={onSave}><Save size={14} /></button>
    </div>
    {error && <p className="git-feedback is-error" role="alert">{error}</p>}
    <div className="repository-code-editor" ref={host} hidden={preview} />
    {preview && markdown && <div className="repository-markdown-preview" aria-label="Markdown preview" tabIndex={0}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        img: ({ alt }) => <span className="repository-markdown-image">[Image: {alt || "image"}]</span>,
        a: ({ children }) => <span className="repository-markdown-link">{children}</span>,
      }}>{content}</Markdown>
    </div>}
    <footer className="repository-editor-statusbar">
      <span aria-label="Cursor position">Ln {position.line}, Col {position.column}</span>
      <span>{indentation === "\t" ? "Tabs: 4" : `Spaces: ${indentation.length}`}</span>
      <span>UTF-8</span>
      <span>{language}</span>
    </footer>
  </div>;
}
