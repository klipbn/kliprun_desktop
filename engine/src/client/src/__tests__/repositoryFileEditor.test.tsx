import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepositoryFileEditor } from "../git/RepositoryFileEditor";
import { createRepositoryEditorState } from "../git/repositoryCodeEditor";
import { EditorState, type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { insertNewlineAndIndent, indentMore, indentLess, undo, redo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";

const defaults = { path: "example.py", content: "", savedContent: "", saving: false, onChange: () => {}, onSave: () => {} };

test("file extension selects Python and SQL parsers for safe lexical highlighting", () => {
  for (const [path, source, keyword, comment] of [
    ["example.py", 'def greet():\n    return "<script>" # note\n', "def", "# note"],
    ["query.SQL", "select '--literal' FROM events; /* block */", "select", "/* block */"],
  ]) {
    const state = createRepositoryEditorState(path!, source!);
    const tokens: Array<[string, string]> = [];
    highlightTree(syntaxTree(state), classHighlighter, (from, to, classes) => tokens.push([state.sliceDoc(from, to), classes]));
    expect(tokens.some(([text, classes]) => text === keyword && classes.includes("tok-keyword"))).toBe(true);
    expect(tokens.some(([text, classes]) => text === comment && classes.includes("tok-comment"))).toBe(true);
    expect(state.doc.toString()).toBe(source!);
  }
});

test("Python Enter indents the next line and indentation edits support undo and redo", () => {
  const source = "def greet():";
  let state = createRepositoryEditorState("example.py", source);
  state = state.update({ selection: { anchor: source.length } }).state;
  const run = (command: StateCommand) => command({ get state() { return state; }, dispatch: transaction => { state = transaction.state; } });
  expect(run(insertNewlineAndIndent)).toBe(true);
  expect(state.doc.toString()).toBe("def greet():\n    ");
  expect(run(indentMore)).toBe(true);
  expect(state.doc.toString()).toBe("def greet():\n        ");
  expect(run(indentLess)).toBe(true);
  expect(state.doc.toString()).toBe("def greet():\n    ");
  expect(run(undo)).toBe(true);
  expect(run(redo)).toBe(true);
  expect(state.doc.toString()).toBe("def greet():\n    ");
});

test("saving read-only state refuses editing commands while retaining the document", () => {
  let state = createRepositoryEditorState("example.py", "pending", EditorState.readOnly.of(true));
  expect(insertNewlineAndIndent({ get state() { return state; }, dispatch: transaction => { state = transaction.state; } })).toBe(false);
  expect(state.doc.toString()).toBe("pending");
});

test("editing CRLF files preserves their line endings and UTF-8 BOM", () => {
  const source = "\ufeffname = 'demo'\r\nprint(name)\r\n";
  let state = createRepositoryEditorState("example.py", source);
  state = state.update({ changes: { from: state.doc.length, insert: "# saved" }, selection: { anchor: state.doc.length + 7 } }).state;
  insertNewlineAndIndent({ get state() { return state; }, dispatch: transaction => { state = transaction.state; } });
  expect(state.sliceDoc()).toBe("\ufeffname = 'demo'\r\nprint(name)\r\n# saved\r\n");
});

test("pasted text adopts the open file line endings", () => {
  const state = createRepositoryEditorState("example.py", "first\r\n");
  const pasted = state.facet(EditorView.clipboardInputFilter).reduce((text, filter) => filter(text, state), "second\nthird\r\n");
  const edited = state.update({ changes: { from: state.doc.length, insert: pasted } }).state;
  expect(edited.sliceDoc()).toBe("first\r\nsecond\r\nthird\r\n");
});

test("save is available only for an unsaved draft that is not already saving", () => {
  const unchanged = renderToStaticMarkup(<RepositoryFileEditor {...defaults} />);
  const dirty = renderToStaticMarkup(<RepositoryFileEditor {...defaults} content="changed" />);
  const saving = renderToStaticMarkup(<RepositoryFileEditor {...defaults} content="changed" saving />);
  expect(unchanged).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save file"/);
  expect(dirty).toContain('aria-label="Unsaved changes"');
  expect(dirty).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save file"/);
  expect(saving).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save file"/);
  expect(saving).toContain('Saving…');
});

test("only Markdown files offer the preview toggle and save errors remain visible", () => {
  const markdown = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="README.md" error="File changed on disk" />);
  expect(markdown).toContain('aria-label="Preview Markdown"');
  expect(markdown).toContain('role="alert">File changed on disk');
  expect(renderToStaticMarkup(<RepositoryFileEditor {...defaults} />)).not.toContain('aria-label="Preview Markdown"');
});

test("editor shows file breadcrumbs and current language, encoding, indentation and cursor position", () => {
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="src/tools/query.sql" />);
  expect(html).toContain('aria-label="File path"');
  expect(html).toContain('query.sql');
  expect(html).toContain('aria-label="Cursor position">Ln 1, Col 1');
  expect(html).toContain('UTF-8');
  expect(html).toContain('Spaces: 2');
  expect(html).toContain('SQL');
});
