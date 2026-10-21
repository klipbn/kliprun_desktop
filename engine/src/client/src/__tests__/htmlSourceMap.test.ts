import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { minimalChange } from "../git/repositoryCodeEditor";
import { hiddenLongLineRanges, linkedElement, longLineFolding, setLinkedElement } from "../git/repositoryLongLines";
import { visualFrameDocument } from "../git/HTMLVisualEditor";
import { savedFileTab, type FileTabs } from "../git/fileTabs";
import { annotateSource, applySplices, createSourceModel, descendants, detach, duplicateElement, ID_ATTRIBUTE, parseAnnotated, removeElement, replaceInner, retagElement, setElementStyle, type SourceEdit, type SourceModel } from "../git/htmlSourceMap";

const REPORT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Q3 <b>report</b></title>
  <style>p > span { color: red }</style>
</head>
<body>
  <h1 class='title'>Revenue &amp; costs</h1>
  <p>First <span data-x=">">para</span>
  <p>Second para
  <ul><li>One<li>Two</ul>
  <table><tr><td>A<td>B<tr><td>C</table>
  <img src="x.png">
  <svg viewBox="0 0 1 1"><path d="M0 0"/><circle r="1"/></svg>
  <!-- <div>commented</div> -->
  <script>const markup = "<div>not an element</div>";</script>
</body>
</html>
`;

const idOf = (model: SourceModel, tag: string, nth = 0) => model.order.filter(id => model.ranges.get(id)?.tag === tag)[nth]!;
const slice = (model: SourceModel, id: string) => { const range = model.ranges.get(id)!; return model.source.slice(range.start, range.end); };
/** What the preview iframe serializes for an untouched element body. */
function annotatedInner(model: SourceModel, id: string) {
  const range = model.ranges.get(id)!, children = descendants(model, id).map(child => [child, model.ranges.get(child)!] as const).sort((a, b) => a[1].nameEnd - b[1].nameEnd);
  let html = "", last = range.openEnd;
  for (const [child, position] of children) { html += model.source.slice(last, position.nameEnd) + ` ${ID_ATTRIBUTE}="${child}"`; last = position.nameEnd; }
  return html + model.source.slice(last, range.closeStart);
}
/** Maintained ranges must equal a fresh scan of the edited source; new untagged markup is not tracked. */
function expectConsistent(model: SourceModel, everyElement = true) {
  const fresh = new Map([...createSourceModel(model.source).ranges.values()].map(range => [range.start, range]));
  const kept = [...model.ranges.values()];
  expect(kept.map(range => fresh.get(range.start))).toEqual(kept);
  if (everyElement) expect(kept.length).toBe(fresh.size);
}
const ok = (edit: SourceEdit) => { if (!edit.ok) throw new Error(edit.error); return edit.undo; };

test("source map finds elements like a browser, skipping comments, raw text and scripts", () => {
  const model = createSourceModel(REPORT);
  expect(slice(model, idOf(model, "h1"))).toBe(`<h1 class='title'>Revenue &amp; costs</h1>`);
  expect(slice(model, idOf(model, "span"))).toBe(`<span data-x=">">para</span>`);
  // Implied end tags close at the next block, list item or cell.
  expect(slice(model, idOf(model, "p"))).toBe(`<p>First <span data-x=">">para</span>\n  `);
  expect(slice(model, idOf(model, "p", 1))).toBe(`<p>Second para\n  `);
  expect(slice(model, idOf(model, "li"))).toBe("<li>One");
  expect(slice(model, idOf(model, "td", 1))).toBe("<td>B");
  expect(slice(model, idOf(model, "tr"))).toBe("<tr><td>A<td>B");
  expect(slice(model, idOf(model, "img"))).toBe(`<img src="x.png">`);
  expect(slice(model, idOf(model, "path"))).toBe(`<path d="M0 0"/>`);
  expect(slice(model, idOf(model, "title"))).toBe("<title>Q3 <b>report</b></title>");
  expect(model.order.some(id => ["b", "div"].includes(model.ranges.get(id)!.tag))).toBe(false);
  expect(slice(model, idOf(model, "script"))).toBe(`<script>const markup = "<div>not an element</div>";</script>`);
});

test("annotation adds one id per tag and parsing it back restores the exact source", () => {
  const model = createSourceModel(REPORT), annotated = annotateSource(model);
  expect(annotated).toContain(`<h1 ${ID_ATTRIBUTE}="${idOf(model, "h1")}" class='title'>`);
  expect(annotated).toContain(`<meta ${ID_ATTRIBUTE}="${idOf(model, "meta")}" charset="utf-8"/>`);
  const parsed = parseAnnotated(annotated);
  expect(parsed.text).toBe(REPORT);
  expect(new Map(parsed.ranges)).toEqual(model.ranges);
});

test("text edits splice only the element body and undo restores every byte", () => {
  const model = createSourceModel(REPORT), id = idOf(model, "h1");
  const undo = ok(replaceInner(model, id, "Revenue <b>up</b> 5%", []));
  expect(model.source).toBe(REPORT.replace("Revenue &amp; costs", "Revenue <b>up</b> 5%"));
  expect(slice(model, id)).toBe(`<h1 class='title'>Revenue <b>up</b> 5%</h1>`);
  expectConsistent(model, false);
  expect(applySplices(model.source, [...undo].reverse()).source).toBe(REPORT);
});

test("edits keep ids of untouched children and reject markup the preview cannot map", () => {
  const model = createSourceModel(REPORT), p = idOf(model, "p"), span = idOf(model, "span");
  expect(replaceInner(model, p, "x", []).ok).toBe(false);
  expect(replaceInner(model, idOf(model, "img"), "x", []).ok).toBe(false);
  ok(replaceInner(model, p, `Edited <span ${ID_ATTRIBUTE}="${span}" data-x="&gt;">para</span>\n  `, [span]));
  expect(slice(model, span)).toBe(`<span data-x="&gt;">para</span>`);
  expectConsistent(model);
});

test("remove, duplicate, retag and style edits keep the map aligned and undo exactly", () => {
  const model = createSourceModel(REPORT);
  const run = (edit: () => SourceEdit) => { const before = model.source; const undo = ok(edit()); expectConsistent(model); expect(applySplices(model.source, [...undo].reverse()).source).toBe(before); };
  const li = idOf(model, "li"), ul = idOf(model, "ul");
  run(() => duplicateElement(model, ul, [[ul, "c1"], ...descendants(model, ul).map((id, index): [string, string] => [id, `c${index + 2}`])]));
  expect(slice(model, "c1")).toBe(slice(model, ul));
  run(() => removeElement(model, li, []));
  run(() => retagElement(model, idOf(model, "p", 1), "h2"));
  expect(slice(model, idOf(model, "h2"))).toBe("<h2>Second para\n  </h2>");
  run(() => retagElement(model, idOf(model, "h1"), "p"));
  expect(model.order.filter(id => model.ranges.get(id)?.tag === "h1")).toEqual([]);
  run(() => setElementStyle(model, idOf(model, "img"), "background-color", "#ffcc00"));
  expect(model.source).toContain(`<img style="background-color: #ffcc00" src="x.png">`);
  const span = idOf(model, "span");
  run(() => setElementStyle(model, span, "color", "#123456"));
  run(() => setElementStyle(model, span, "color", ""));
  expect(slice(model, span)).toBe(`<span data-x=">">para</span>`);
  expect(retagElement(model, idOf(model, "td"), "h1").ok).toBe(false);
});

for (const initial of [7, 42, 1234, 2026, 99_991]) test(`random edit sequences never drift from a fresh scan (seed ${initial})`, () => {
  let seed = initial;
  const random = (limit: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % limit; };
  const source = REPORT + "<div><section><p>Nested <em>text</em></p><p>More<p>Implied</section><br><input value='a>b'></div>\n".repeat(3) +
    "<dl><dt>Term<dd>Definition<dt>Other</dl><ol><li><p>Item<li>Next</ol><select><option>A<option>B</select><h2>Heading<h3>Sub</h3>\n";
  const model = createSourceModel(source), undoStack: [string, ReturnType<typeof ok>][] = [];
  let copies = 0;
  for (let step = 0; step < 300; step++) {
    const body = model.order.find(id => model.ranges.get(id)?.tag === "body")!;
    const candidates = descendants(model, body).filter(id => !["script", "title", "style"].includes(model.ranges.get(id)!.tag)).sort();
    if (!candidates.length) break;
    const id = candidates[random(candidates.length)], range = model.ranges.get(id)!, before = model.source;
    const kind = random(5);
    let edit: SourceEdit;
    if (kind === 0 && range.openEnd < range.end) {
      const children = descendants(model, id), inner = annotatedInner(model, id);
      edit = replaceInner(model, id, `T${step}&amp;` + inner, children);
    } else if (kind === 1 && descendants(model, body).length > 20) edit = removeElement(model, id, descendants(model, id));
    else if (kind === 2 && model.source.length < 20_000) edit = duplicateElement(model, id, [id, ...descendants(model, id)].map(original => [original, `copy${copies++}`]));
    else if (kind === 3) edit = retagElement(model, id, ["p", "div", "h3"][random(3)]!);
    else edit = setElementStyle(model, id, "color", random(2) ? `#00${step % 10}000` : "");
    if (!edit.ok) { expect(model.source).toBe(before); continue; }
    undoStack.push([before, edit.undo]);
    expectConsistent(model);
  }
  expect(undoStack.length).toBeGreaterThan(100);
  let current = model.source;
  for (const [before, undo] of undoStack.reverse()) { current = applySplices(current, [...undo].reverse()).source; expect(current).toBe(before); }
  expect(current).toBe(source);
});

test("scanning a 40 MB report stays fast", () => {
  const row = `<tr><td class="a">Value &amp; more</td><td style="color:red">42</td><td><span>x</span></td></tr>\n`;
  const source = `<!doctype html><html><body><table>${row.repeat(Math.floor(40e6 / row.length))}</table></body></html>`;
  const started = performance.now(), model = createSourceModel(source);
  expect(model.order.length).toBeGreaterThan(1_000_000);
  expect(performance.now() - started).toBeLessThan(5000);
});

test("the visual preview keeps the doctype first so the page renders in standards mode", () => {
  const frame = visualFrameDocument(createSourceModel(REPORT), [0, 120]);
  expect(frame.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"')).toBe(true);
  expect(frame).toContain(`<h1 ${ID_ATTRIBUTE}=`);
  expect(frame).toContain("[0,120]");
  expect(visualFrameDocument(createSourceModel("<p>No doctype</p>")).startsWith("<meta http-equiv")).toBe(true);
});

test("code editor updates replace only the changed text", () => {
  expect(minimalChange("same", "same")).toBeNull();
  expect(minimalChange("<p>Hello world</p>", "<p>Hello brave world</p>")).toEqual({ from: 9, to: 9, insert: "brave " });
  expect(minimalChange("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
  expect(minimalChange("", "new")).toEqual({ from: 0, to: 0, insert: "new" });
});

test("a finished save keeps edits made while it was in flight", () => {
  const snapshot = { root: "/demo", path: "a.html", revision: "1", content: "old", draft: "saved" };
  const state: FileTabs = { directory: "/demo", activeId: 1, tabs: [{ id: 1, path: "a.html", pinned: true, file: { ...snapshot, draft: "saved and more" }, loading: false, error: null, saving: true, savedAt: 0 }] };
  const data = { root: "/demo", path: "a.html", revision: "2", content: "saved" };
  expect(savedFileTab(state, 1, snapshot, data, 5).tabs[0]).toMatchObject({ saving: false, savedAt: 5, file: { revision: "2", content: "saved", draft: "saved and more" } });
  const unchanged = { ...state, tabs: [{ ...state.tabs[0]!, file: snapshot }] };
  expect(savedFileTab(unchanged, 1, snapshot, data, 5).tabs[0]!.file).toMatchObject({ content: "saved", draft: "saved" });
});

test("blocks on their own line are removed with that line and copied onto the next one", () => {
  const source = "<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>\n<p>a <b>b</b> c</p>\n";
  const model = createSourceModel(source), [one, two] = model.order.filter(id => model.ranges.get(id)!.tag === "li");
  ok(duplicateElement(model, one!, [[one!, "copy"]]));
  expect(model.source).toBe("<ul>\n  <li>One</li>\n  <li>One</li>\n  <li>Two</li>\n</ul>\n<p>a <b>b</b> c</p>\n");
  expectConsistent(model);
  ok(removeElement(model, two!, []));
  expect(model.source).toBe("<ul>\n  <li>One</li>\n  <li>One</li>\n</ul>\n<p>a <b>b</b> c</p>\n");
  expectConsistent(model);
  // Inline elements keep their surroundings.
  ok(removeElement(model, idOf(model, "b"), []));
  expect(model.source).toBe("<ul>\n  <li>One</li>\n  <li>One</li>\n</ul>\n<p>a  c</p>\n");
  expectConsistent(model);
  // An implicitly closed sibling owns the whitespace before the next item, so it stays.
  const implied = createSourceModel("<ul>\n  <li>One\n  <li>Two\n</ul>");
  ok(removeElement(implied, implied.order.filter(id => implied.ranges.get(id)!.tag === "li")[1]!, []));
  expect(implied.source).toBe("<ul>\n  <li>One\n  </ul>");
  expectConsistent(implied);
});

test("very long lines are shown in part, keeping their ends, the cursor and the linked element", () => {
  const data = "x".repeat(200_000), doc = `<p>short</p>\n<script>var d="${data}";</script>\n<p>after</p>`;
  const long = doc.indexOf("<script>"), end = doc.indexOf("</script>") + 9;
  let state = EditorState.create({ doc, extensions: [linkedElement, longLineFolding] });
  const hidden = hiddenLongLineRanges(state);
  expect(hidden).toEqual([[long + 4000, end - 400]]);
  state = state.update({ selection: { anchor: long + 100_000 }, effects: setLinkedElement.of({ from: long + 150_000, to: long + 150_010 }) }).state;
  const ranges = hiddenLongLineRanges(state);
  for (const position of [long + 100_000, long + 150_000, long + 150_010]) expect(ranges.some(([from, to]) => position > from && position < to)).toBe(false);
  expect(ranges.reduce((total, [from, to]) => total + to - from, 0)).toBeGreaterThan(170_000);
  expect(hiddenLongLineRanges(EditorState.create({ doc: "<p>small</p>", extensions: [longLineFolding] }))).toEqual([]);
  // Selecting across the whole line keeps only its ends visible.
  const across = state.update({ selection: { anchor: 0, head: doc.length }, effects: setLinkedElement.of({ from: long, to: end }) }).state;
  expect(hiddenLongLineRanges(across).reduce((total, [from, to]) => total + to - from, 0)).toBeGreaterThan(190_000);
});

test("undo entries hold copies of the removed text, not slices of the whole file", () => {
  const model = createSourceModel(REPORT + "<p>tail</p>".repeat(1000)), h1 = idOf(model, "h1");
  const [undo] = ok(replaceInner(model, h1, "New title", []));
  expect(undo!.text).toBe("Revenue &amp; costs");
  expect(detach("Revenue")).toBe("Revenue");
  expect(detach("")).toBe("");
  expect(detach("Отчёт — «итог»\n")).toBe("Отчёт — «итог»\n");
});
