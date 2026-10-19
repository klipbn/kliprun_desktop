import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepositoryFileEditor } from "../git/RepositoryFileEditor";
import { createRepositoryEditorState, repositoryFileLanguage } from "../git/repositoryCodeEditor";
import { EditorState, type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { insertNewlineAndIndent, indentMore, indentLess, undo, redo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";

const defaults = { path: "example.py", content: "", savedContent: "", saving: false, onChange: () => {}, onSave: () => {} };

test("repository files expose Git change review without staging or reverting edits", () => {
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} directory="/demo" />);
  expect(html).toContain('aria-label="Show changes"');
  expect(html).not.toContain('aria-label="Reject change"');
  expect(html).not.toContain('aria-label="Stage change"');
});

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

test("Markdown files offer their preview toggle and save errors remain visible", () => {
  const markdown = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="README.md" error="File changed on disk" />);
  expect(markdown).toContain('aria-label="Preview Markdown"');
  expect(markdown).toContain('role="alert">File changed on disk');
  expect(renderToStaticMarkup(<RepositoryFileEditor {...defaults} />)).not.toContain('aria-label="Preview Markdown"');
});

test("HTML files offer an explicit preview while opening as highlighted source without executing it", () => {
  for (const path of ["report.html", "index.HTM"]) {
    const source = '<!doctype html><html><body><h1>Report</h1><script>window.untrusted = true</script></body></html>';
    const markup = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path={path} content={source} savedContent={source} />);
    expect(repositoryFileLanguage(path)).toBe("HTML");
    expect(markup).toContain('aria-label="Preview HTML"');
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("<script");
    const state = createRepositoryEditorState(path, source);
    expect(syntaxTree(state).toString()).toContain("Script");
    expect(state.sliceDoc()).toBe(source);
  }
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

test("notebooks open as readable cells with saved results instead of raw JSON", () => {
  const content = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { language_info: { name: "python" } }, cells: [
    { cell_type: "markdown", metadata: {}, source: ["# Experiment\n", "Saved **results**."] },
    { cell_type: "code", metadata: {}, execution_count: 3, source: ["answer = 42\n", "print(answer)"], outputs: [
      { output_type: "stream", name: "stdout", text: ["42\n"] },
      { output_type: "execute_result", execution_count: 3, metadata: {}, data: { "text/html": ["<table><tr><th>Answer</th></tr><tr><td>42</td></tr></table>"], "text/plain": "Unformatted fallback" } },
      { output_type: "display_data", metadata: {}, data: { "image/png": "iVBORw0KGgo=" } },
    ] },
    { cell_type: "raw", metadata: {}, source: "Raw notes" },
  ] });
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="analysis.ipynb" content={content} savedContent={content} />);
  expect(html).toContain('aria-label="Notebook preview"');
  expect(html).toContain('<h1>Experiment</h1>');
  expect(html).toContain('<strong>results</strong>');
  expect(html).toContain('In [3]');
  expect(html).toContain('repository-token-number');
  expect(html).toContain('<th>Answer</th>');
  expect(html).not.toContain("Unformatted fallback");
  expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  expect(html).toContain('Raw notes');
  expect(html).toContain('aria-label="Edit notebook JSON"');
  expect(html).not.toContain('aria-label="Unsaved changes"');
});

test("notebook results cannot execute HTML, load remote images or hide errors and unsupported results", () => {
  const content = JSON.stringify({ nbformat: 4, cells: [
    { cell_type: "markdown", source: "![Attached](attachment:chart.png) ![Remote](https://example.invalid/pixel) [Link](https://example.invalid/)",
      attachments: { "chart.png": { "image/png": "iVBORw0KGgo=" } } },
    { cell_type: "code", source: "<script>window.executed = true</script>", outputs: [
      { output_type: "display_data", data: { "text/html": '<script>window.executed = true</script><iframe src="https://example.invalid/"></iframe><style>body{display:none}</style><table onclick="alert(1)"><tr><td>Safe table</td></tr></table><img src="https://example.invalid/pixel" onerror="alert(1)"><a href="javascript:alert(1)">Link</a>' } },
      { output_type: "stream", name: "stderr", text: "Warning: saved stderr" },
      { output_type: "error", ename: "ValueError", evalue: "bad value", traceback: ["\u001b[31mValueError\u001b[0m", "bad value"] },
      { output_type: "display_data", data: { "application/javascript": "window.executed = true" } },
    ] },
  ] });
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="output.IPYNB" content={content} savedContent={content} />);
  expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  expect(html).toContain('<td>Safe table</td>');
  expect(html).toContain("Warning: saved stderr");
  expect(html).toContain("ValueError\nbad value");
  expect(html).toContain("application/javascript");
  for (const forbidden of ['<script', '<iframe', '<style', 'onclick=', 'onerror=', 'href=', 'src="https:', '\u001b[31m']) expect(html).not.toContain(forbidden);
});

test("invalid, unsupported and empty notebooks have a readable fallback with access to JSON", () => {
  for (const content of ["{broken", "null", '{"nbformat":3,"worksheets":[]}', '{"nbformat":4,"cells":{}}']) {
    const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="broken.ipynb" content={content} savedContent={content} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Edit notebook JSON"');
    expect(html).not.toContain('aria-label="Unsaved changes"');
  }
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="empty.ipynb" content='{"nbformat":4,"cells":[]}' />);
  expect(html).toContain("No cells in this notebook.");
});

test("notebook syntax highlighting keeps token boundaries after CRLF line breaks", () => {
  const content = JSON.stringify({ nbformat: 4, metadata: { language_info: { name: "python" } }, cells: [
    { cell_type: "code", source: "# Saved cell\r\nvalue = 42", outputs: [] },
  ] });
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="crlf.ipynb" content={content} savedContent={content} />);
  expect(html).toContain('class="repository-token-number">42</span>');
});

test("large and interactive notebook HTML uses a bounded text fallback while other cells remain readable", () => {
  const content = JSON.stringify({ nbformat: 4, cells: [
    { cell_type: "code", source: "plot()", outputs: [
      { output_type: "display_data", data: { "text/html": `<div><script>${"plotly bundle;".repeat(100000)}</script></div>`, "text/plain": "Saved chart" } },
      { output_type: "display_data", data: { "text/html": '<div class="plotly-graph-div"></div><script>Plotly.newPlot("chart", []);</script>', "text/plain": "Interactive chart" } },
    ] },
    { cell_type: "markdown", source: "# Still readable" },
  ] });
  const html = renderToStaticMarkup(<RepositoryFileEditor {...defaults} path="large.ipynb" content={content} savedContent={content} />);
  expect(html).toContain("Saved chart");
  expect(html).toContain("Interactive chart");
  expect(html).toContain("Open in Default App");
  expect(html).toContain("<h1>Still readable</h1>");
  expect(html).not.toContain("plotly bundle");
  expect(html.length).toBeLessThan(10000);
});
