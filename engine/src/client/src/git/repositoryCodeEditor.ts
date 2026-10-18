import { EditorState, type Extension } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { EditorView, keymap, ViewPlugin, Decoration, type ViewUpdate, type DecorationSet } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";

export function repositoryFileLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "py" || extension === "pyw") return "Python";
  if (extension === "sql") return "SQL";
  if (["md", "markdown", "mdown"].includes(extension ?? "")) return "Markdown";
  if (extension === "html" || extension === "htm") return "HTML";
  if (["ts", "tsx", "mts", "cts"].includes(extension ?? "")) return "TypeScript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) return "JavaScript";
  if (extension === "json") return "JSON";
  if (extension === "ipynb") return "Jupyter Notebook";
  return "Plain text";
}

function languageExtension(path: string): Extension {
  switch (repositoryFileLanguage(path)) {
    case "Python": return python();
    case "SQL": return sql();
    case "TypeScript": return javascript({ typescript: true, jsx: /\.tsx$/i.test(path) });
    case "JavaScript": return javascript({ jsx: /\.jsx$/i.test(path) });
    case "JSON": case "Jupyter Notebook": return json();
    case "Markdown": return markdown();
    case "HTML": return html();
    default: return [];
  }
}

export function repositoryIndentUnit(path: string, content: string): string {
  const prefixes = [...content.matchAll(/^([\t ]+)\S/gm)].map(match => match[1]!);
  if (prefixes.some(prefix => prefix.startsWith("\t"))) return "\t";
  const widths = prefixes.map(prefix => prefix.length).filter(width => width >= 2 && width <= 8);
  return " ".repeat(widths.length ? Math.min(...widths) : repositoryFileLanguage(path) === "Python" ? 4 : 2);
}

export const repositoryHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], class: "repository-token-keyword" },
  { tag: [tags.string, tags.regexp, tags.special(tags.string)], class: "repository-token-string" },
  { tag: [tags.comment, tags.meta], class: "repository-token-comment" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: "repository-token-number" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: "repository-token-function" },
  { tag: [tags.typeName, tags.className, tags.namespace], class: "repository-token-type" },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], class: "repository-token-variable" },
  { tag: [tags.heading], class: "repository-token-heading" },
  { tag: tags.link, class: "repository-token-link" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
]);

const indentGuides = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
  }
  build(view: EditorView): DecorationSet {
    const unit = view.state.facet(indentUnit);
    const step = unit === "\t" ? view.state.tabSize : unit.length;
    const marks = [];
    for (const { from, to } of view.visibleRanges) {
      for (let position = from; position <= to;) {
        const line = view.state.doc.lineAt(position);
        const prefix = /^[\t ]+/.exec(line.text)?.[0] ?? "";
        const columns = [...prefix].reduce((width, char) => width + (char === "\t" ? step - width % step : 1), 0);
        if (columns) marks.push(Decoration.line({ class: "cm-indent-guides", attributes: { style: `--indent-columns:${columns}ch;--indent-step:${step}ch` } }).range(line.from));
        position = line.to + 1;
      }
    }
    return Decoration.set(marks, true);
  }
}, { decorations: plugin => plugin.decorations });

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--theme-text)", backgroundColor: "var(--theme-background)", fontSize: "15px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: "1.55" },
  ".cm-content": { padding: "12px 0 32px", caretColor: "var(--theme-strong)" },
  ".cm-line": { padding: "0 16px 0 6px" },
  ".cm-gutters": { backgroundColor: "var(--theme-background)", color: "var(--theme-muted)", border: "none", paddingRight: "6px" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "40px", paddingLeft: "10px" },
  ".cm-activeLineGutter": { color: "var(--theme-strong)", backgroundColor: "var(--theme-surface)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--theme-surface) 65%, transparent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--theme-strong)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--theme-accent) 26%, transparent) !important" },
  "&.cm-focused": { outline: "none" },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--theme-accent) 24%, transparent)", outline: "1px solid color-mix(in srgb, var(--theme-accent) 50%, transparent)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--theme-surface)", borderColor: "var(--theme-border)", color: "var(--theme-muted)" },
  ".cm-panels, .cm-tooltip": { color: "var(--theme-text)", backgroundColor: "var(--theme-surface)", borderColor: "var(--theme-border)" },
}, { dark: true });

export function createRepositoryEditorState(path: string, content: string, extensions: Extension = []) {
  return EditorState.create({
    doc: content,
    extensions: [extensions, keymap.of([indentWithTab]), basicSetup, languageExtension(path), EditorView.lineWrapping,
      indentUnit.of(repositoryIndentUnit(path, content)), EditorState.tabSize.of(4),
      EditorState.lineSeparator.of(content.includes("\r\n") ? "\r\n" : "\n"),
      EditorView.clipboardInputFilter.of((text, state) => text.replace(/\r\n?|\n/g, state.lineBreak)),
      syntaxHighlighting(repositoryHighlightStyle), indentGuides, theme],
  });
}
