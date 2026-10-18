import { useMemo, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { syntaxTree } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { createRepositoryEditorState, repositoryHighlightStyle } from "./repositoryCodeEditor";
import "./notebookPreview.css";

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string => typeof value === "string" ? value : Array.isArray(value) ? value.filter(item => typeof item === "string").join("") : "";
const plainText = (value: unknown) => text(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const htmlSchema = { ...defaultSchema, protocols: { ...defaultSchema.protocols, src: ["data"] } };
const MARKUP_LIMIT = 128 * 1024;

function NotebookText({ source, error = false }: { source: string; error?: boolean }) {
  const limit = 32 * 1024;
  return <><pre className={`notebook-output-text${error ? " is-error" : ""}`}>{source.slice(0, limit)}</pre>
    {source.length > limit && <p className="notebook-notice">Output shortened in preview. The full output is preserved in the JSON source.</p>}</>;
}

function imageSource(data: Json): string | null {
  for (const mime of imageTypes) {
    const base64 = text(data[mime]).replace(/\s/g, "");
    if (base64 && /^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) return `data:${mime};base64,${base64}`;
  }
  return null;
}

function NotebookMarkup({ source, html = false, attachments = {} }: { source: string; html?: boolean; attachments?: Json }) {
  if (source.length > MARKUP_LIMIT) return <><p className="notebook-notice">Large markup shown as text in preview.</p><NotebookText source={source} /></>;
  return <div className="repository-markdown-preview notebook-markup"><Markdown remarkPlugins={[remarkGfm]}
    skipHtml={!html} rehypePlugins={html ? [rehypeRaw, [rehypeSanitize, htmlSchema]] : []}
    urlTransform={(url, key) => {
      if (key === "src" && url.startsWith("attachment:")) return imageSource(record(attachments[url.slice(11)])) ?? "";
      if (key === "src" && /^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(url)) return url;
      return defaultUrlTransform(url);
    }} components={{
      a: ({ children }) => <span className="repository-markdown-link">{children}</span>,
      img: ({ src, alt }) => typeof src === "string" && /^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(src)
        ? <img src={src} alt={alt || "Notebook image"} loading="lazy" />
        : <span className="repository-markdown-image">[Image: {alt || "image"}]</span>,
    }}>{source}</Markdown></div>;
}

function NotebookCode({ source, language }: { source: string; language: string }) {
  const highlighted = useMemo(() => {
    const extension = ({ python: "py", sql: "sql", javascript: "js", typescript: "ts", json: "json" } as Record<string, string>)[language.toLowerCase()] ?? "txt";
    const state = createRepositoryEditorState(`cell.${extension}`, source);
    const parts: ReactNode[] = [];
    let end = 0;
    highlightTree(syntaxTree(state), repositoryHighlightStyle, (from, to, classes) => {
      if (from > end) parts.push(state.doc.sliceString(end, from));
      parts.push(<span key={from} className={classes}>{state.doc.sliceString(from, to)}</span>);
      end = to;
    });
    parts.push(state.doc.sliceString(end));
    return parts;
  }, [source, language]);
  return <pre className="notebook-code"><code>{highlighted}</code></pre>;
}

function NotebookOutput({ output }: { output: Json }) {
  if (output.output_type === "stream") return <NotebookText source={plainText(output.text)} error={output.name === "stderr"} />;
  if (output.output_type === "error") {
    const traceback = Array.isArray(output.traceback) ? output.traceback.map(plainText).join("\n") : "";
    return <NotebookText source={traceback || `${text(output.ename)}: ${text(output.evalue)}`} error />;
  }
  const data = record(output.data), image = imageSource(data);
  if (image) return <img className="notebook-output-image" src={image} alt="Saved notebook output" loading="lazy" />;
  const html = text(data["text/html"]);
  // Plotly embeds its entire JavaScript bundle; feeding it to Markdown can block for minutes.
  if (html.length > MARKUP_LIMIT || /plotly-graph-div|Plotly\.newPlot\s*\(/i.test(html)) return <>
    <p className="notebook-notice">{html.length > MARKUP_LIMIT ? "Large HTML output" : "Interactive chart"} is not rendered in preview. Use Open in Default App from the file menu to view it. The saved output is preserved.</p>
    {"text/plain" in data && <NotebookText source={plainText(data["text/plain"])} />}
  </>;
  if (html) return <NotebookMarkup source={html} html />;
  if (text(data["text/markdown"])) return <NotebookMarkup source={text(data["text/markdown"])} />;
  if ("text/plain" in data) return <NotebookText source={plainText(data["text/plain"])} />;
  return <p className="notebook-notice">This saved output cannot be displayed ({Object.keys(data).join(", ") || "unknown format"}).</p>;
}

export function NotebookPreview({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try {
      const notebook = record(JSON.parse(content.replace(/^\ufeff/, "")));
      if (notebook.nbformat !== 4 || !Array.isArray(notebook.cells)) return { error: "Unsupported notebook format. Open the JSON source to inspect this file." };
      return { notebook, cells: notebook.cells.map(record) };
    } catch { return { error: "Unable to read notebook JSON. Open the JSON source to inspect or fix this file." }; }
  }, [content]);
  if (parsed.error || !parsed.cells) return <div className="notebook-preview" aria-label="Notebook preview"><p className="notebook-notice" role="alert">{parsed.error}</p></div>;
  const metadata = record(parsed.notebook.metadata);
  const language = text(record(metadata.language_info).name) || text(record(metadata.kernelspec).language) || "Plain text";
  return <div className="notebook-preview" aria-label="Notebook preview" tabIndex={0}>
    <div className="notebook-summary"><span>{parsed.cells.length} cells · {language}</span><span>Saved outputs</span></div>
    {parsed.cells.length === 0 && <p className="notebook-notice">No cells in this notebook.</p>}
    {parsed.cells.map((cell, index) => <section className={`notebook-cell is-${cell.cell_type === "code" ? "code" : cell.cell_type === "markdown" ? "markdown" : "raw"}`} key={index} aria-label={`Cell ${index + 1}`}>
      <div className="notebook-cell-label">{cell.cell_type === "code" ? `In [${Number.isInteger(cell.execution_count) ? cell.execution_count : " "}]` : cell.cell_type === "markdown" ? "Markdown" : "Raw"}</div>
      <div className="notebook-cell-content">
        {cell.cell_type === "markdown" ? <NotebookMarkup source={text(cell.source)} attachments={record(cell.attachments)} />
          : cell.cell_type === "code" ? <NotebookCode source={text(cell.source)} language={language} />
          : <pre className="notebook-code">{text(cell.source)}</pre>}
        {cell.cell_type === "code" && Array.isArray(cell.outputs) && cell.outputs.length > 0 && <div className="notebook-outputs" aria-label={`Outputs for cell ${index + 1}`}>
          {cell.outputs.map((output, outputIndex) => <NotebookOutput key={outputIndex} output={record(output)} />)}
        </div>}
      </div>
    </section>)}
  </div>;
}
