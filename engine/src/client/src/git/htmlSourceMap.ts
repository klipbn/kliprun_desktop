// Maps every element of an HTML file to its exact source offsets, so visual edits become
// small splices of the original text: untouched markup, formatting and scripts keep their
// bytes, and the code editor can select what the preview selected.
export const ID_ATTRIBUTE = "data-kliprun-id";

export interface ElementRange { start: number; nameEnd: number; openEnd: number; closeStart: number; end: number; tag: string }
export interface SourceModel { source: string; ranges: Map<string, ElementRange>; order: string[] }
export interface Splice { from: number; to: number; text: string }
export type SourceEdit = { ok: true; undo: Splice[] } | { ok: false; error: string };

const VOID = new Set("area base br col embed hr img input keygen link meta param source track wbr".split(" "));
const RAW = new Set("script style textarea title xmp iframe noembed noframes noscript".split(" "));
const CLOSES_P = new Set("address article aside blockquote details dialog dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol p pre section table ul".split(" "));
const HEADINGS = new Set("h1 h2 h3 h4 h5 h6".split(" "));
const SCOPE = new Set("applet caption html table td th marquee object template".split(" "));
const TABLE_SCOPE = new Set("html table template".split(" "));
const BUTTON_SCOPE = new Set([...SCOPE, "button"]), LIST_SCOPE = new Set([...SCOPE, "ol", "ul"]), DEFINITION_SCOPE = new Set([...SCOPE, "dl"]);
const CELLS = new Set(["td", "th"]), ROW_SCOPE = new Set(["table", "thead", "tbody", "tfoot"]), SECTIONS = new Set(["thead", "tbody", "tfoot"]);
const DEFINITIONS = new Set(["dd", "dt"]), CELL_SCOPE = new Set(["table", "tr"]), TABLE_ONLY = new Set(["table"]);
const TABLE_PARTS = new Set("table thead tbody tfoot tr td th caption colgroup".split(" "));
/** Block tags a selected element may be converted between. */
export const TEXT_BLOCKS = ["p", "h1", "h2", "h3", "h4", "blockquote", "pre", "div"] as const;

interface Scanned extends ElementRange { id?: { value: string; start: number; end: number } }

/**
 * A copy of `text` that does not share memory with the string it was sliced from. Engines keep
 * a whole string alive for any slice of it, so a short undo entry would otherwise pin a full
 * 40 MB version of the file.
 */
export const detach = (text: string): string => text.length ? JSON.parse(JSON.stringify(text)) : "";
// Tag names are shared, so ranges never pin the source they were scanned from.
const tagNames = new Map<string, string>();
const tagName = (raw: string) => { const lower = raw.toLowerCase(); let name = tagNames.get(lower); if (!name) { name = detach(lower); if (tagNames.size < 4096) tagNames.set(name, name); } return name; };

const isSpace = (code: number) => code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
const isLetter = (code: number) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

/** A tolerant single-pass scan that follows the browser's common implied-end-tag rules. */
function scan(source: string, captureIds: boolean, inForeign = false, firstOnly = false): Scanned[] {
  const length = source.length, elements: Scanned[] = [], stack: Scanned[] = [];
  let foreign = inForeign ? 1 : 0, firstClosed = false;
  const close = (index: number, at: number) => {
    while (stack.length > index) {
      const element = stack.pop()!;
      if (element === elements[0]) firstClosed = true;
      element.closeStart = element.end = at;
      if (element.tag === "svg" || element.tag === "math") foreign--;
    }
  };
  const find = (tag: string | Set<string>, boundary: Set<string>) => {
    for (let index = stack.length - 1; index >= 0; index--) {
      const name = stack[index].tag;
      if (typeof tag === "string" ? name === tag : tag.has(name)) return index;
      if (boundary.has(name)) return -1;
    }
    return -1;
  };
  let position = 0;
  while (position < length && !(firstOnly && firstClosed)) {
    const open = source.indexOf("<", position);
    if (open < 0) break;
    const next = source.charCodeAt(open + 1);
    if (next === 33 /* ! */ || next === 63 /* ? */) {
      const comment = source.startsWith("<!--", open);
      const end = comment ? source.indexOf("-->", open + 4) : source.indexOf(">", open);
      position = end < 0 ? length : end + (comment ? 3 : 1);
      continue;
    }
    const closing = next === 47; /* / */
    let cursor = open + (closing ? 2 : 1);
    if (!isLetter(source.charCodeAt(cursor))) { position = open + 1; continue; }
    while (cursor < length) {
      const code = source.charCodeAt(cursor);
      if (isSpace(code) || code === 47 || code === 62) break;
      cursor++;
    }
    const nameEnd = cursor, tag = tagName(source.slice(open + (closing ? 2 : 1), nameEnd));
    let selfClosing = false, id: Scanned["id"];
    // Attributes, honoring quotes so a ">" inside a value does not end the tag.
    while (cursor < length) {
      const code = source.charCodeAt(cursor);
      if (isSpace(code)) { cursor++; continue; }
      if (code === 62) { cursor++; break; }
      if (code === 47) { cursor++; if (source.charCodeAt(cursor) === 62) { selfClosing = true; cursor++; break; } continue; }
      const nameStart = cursor;
      cursor++;
      while (cursor < length) {
        const value = source.charCodeAt(cursor);
        if (isSpace(value) || value === 47 || value === 62 || value === 61) break;
        cursor++;
      }
      const attribute = source.slice(nameStart, cursor);
      let after = cursor;
      while (after < length && isSpace(source.charCodeAt(after))) after++;
      let valueStart = -1, valueEnd = -1;
      if (source.charCodeAt(after) === 61) {
        after++;
        while (after < length && isSpace(source.charCodeAt(after))) after++;
        const quote = source.charCodeAt(after);
        if (quote === 34 || quote === 39) {
          const end = source.indexOf(quote === 34 ? '"' : "'", after + 1);
          valueStart = after + 1; valueEnd = end < 0 ? length : end; cursor = end < 0 ? length : end + 1;
        } else {
          valueStart = after;
          while (after < length && !isSpace(source.charCodeAt(after)) && source.charCodeAt(after) !== 62) after++;
          valueEnd = after; cursor = after;
        }
      }
      if (captureIds && !closing && !id && attribute.toLowerCase() === ID_ATTRIBUTE && valueStart >= 0) id = { value: source.slice(valueStart, valueEnd), start: nameStart - 1, end: cursor };
    }
    position = cursor;
    if (closing) {
      const index = find(tag, TABLE_PARTS.has(tag) ? TABLE_SCOPE : tag === "p" ? BUTTON_SCOPE : tag === "li" ? LIST_SCOPE : SCOPE);
      if (index < 0) continue;
      close(index + 1, open);
      const element = stack.pop()!;
      if (element === elements[0]) firstClosed = true;
      element.closeStart = open; element.end = cursor;
      if (tag === "svg" || tag === "math") foreign--;
      continue;
    }
    // Start tags implicitly close the elements a browser would close before them.
    if (!foreign) {
      if (CLOSES_P.has(tag)) { const index = find("p", BUTTON_SCOPE); if (index >= 0) close(index, open); }
      if (tag === "li") { const index = find("li", LIST_SCOPE); if (index >= 0) close(index, open); }
      if (tag === "dd" || tag === "dt") { const index = find(DEFINITIONS, DEFINITION_SCOPE); if (index >= 0) close(index, open); }
      if (tag === "td" || tag === "th") { const index = find(CELLS, CELL_SCOPE); if (index >= 0) close(index, open); }
      if (tag === "tr") { const index = find("tr", ROW_SCOPE); if (index >= 0) close(index, open); }
      if (tag === "thead" || tag === "tbody" || tag === "tfoot") { const index = find(SECTIONS, TABLE_ONLY); if (index >= 0) close(index, open); }
      if (tag === "option" || tag === "optgroup") { const top = stack.at(-1)?.tag; if (top === "option") close(stack.length - 1, open); }
      if (HEADINGS.has(tag) && HEADINGS.has(stack.at(-1)?.tag ?? "")) close(stack.length - 1, open);
      if (tag === "body" && stack.at(-1)?.tag === "head") close(stack.length - 1, open);
      if (firstOnly && firstClosed) break;
    }
    const element: Scanned = { start: open, nameEnd, openEnd: cursor, closeStart: cursor, end: cursor, tag, id };
    elements.push(element);
    if (VOID.has(tag) || (selfClosing && foreign) || (selfClosing && (tag === "svg" || tag === "math"))) continue;
    if (RAW.has(tag) || tag === "plaintext") {
      // Raw text ends only at the matching close tag, whatever markup it contains.
      let search = cursor, end = -1;
      const lower = tag === "plaintext" ? "" : `</${tag}`;
      while (lower && search < length) {
        const found = source.indexOf("</", search);
        if (found < 0) break;
        const after = source.charCodeAt(found + lower.length);
        if (source.slice(found, found + lower.length).toLowerCase() === lower && (isSpace(after) || after === 62 || after === 47 || Number.isNaN(after))) { end = found; break; }
        search = found + 2;
      }
      if (end < 0) { element.closeStart = element.end = position = length; continue; }
      const closeEnd = source.indexOf(">", end);
      element.closeStart = end; element.end = position = closeEnd < 0 ? length : closeEnd + 1;
      continue;
    }
    if (tag === "svg" || tag === "math") foreign++;
    stack.push(element);
  }
  close(0, length);
  return elements;
}

export function createSourceModel(source: string): SourceModel {
  const ranges = new Map<string, ElementRange>(), order: string[] = [];
  scan(source, false).forEach((element, index) => {
    const id = `k${index}`;
    ranges.set(id, { start: element.start, nameEnd: element.nameEnd, openEnd: element.openEnd, closeStart: element.closeStart, end: element.end, tag: element.tag });
    order.push(id);
  });
  return { source, ranges, order };
}

/** The source with an id attribute after every tag name, for the preview iframe. */
export function annotateSource(model: SourceModel): string {
  const parts: string[] = [];
  let last = 0;
  for (const id of model.order) {
    const range = model.ranges.get(id);
    if (!range || range.nameEnd < last) continue;
    parts.push(model.source.slice(last, range.nameEnd), ` ${ID_ATTRIBUTE}="${id}"`);
    last = range.nameEnd;
  }
  parts.push(model.source.slice(last));
  return parts.join("");
}

/** Strips the iframe's ids from serialized markup and returns ranges relative to the clean text. */
export function parseAnnotated(html: string, inForeign = false): { text: string; ranges: [string, ElementRange][] } {
  const elements = scan(html, true, inForeign), spans = elements.flatMap(element => element.id ? [element.id] : []).sort((a, b) => a.start - b.start);
  if (!spans.length) return { text: html, ranges: [] };
  const parts: string[] = [];
  let last = 0;
  for (const span of spans) { parts.push(html.slice(last, span.start)); last = span.end; }
  parts.push(html.slice(last));
  const removedBefore: number[] = [];
  spans.reduce((total, span) => { total += span.end - span.start; removedBefore.push(total); return total; }, 0);
  const map = (position: number) => {
    let low = 0, high = spans.length;
    while (low < high) { const middle = (low + high) >> 1; if (spans[middle].end <= position) low = middle + 1; else high = middle; }
    return position - (low ? removedBefore[low - 1] : 0);
  };
  const seen = new Set<string>(), ranges: [string, ElementRange][] = [];
  for (const element of elements) {
    if (!element.id || seen.has(element.id.value)) continue;
    seen.add(element.id.value);
    ranges.push([element.id.value, { start: map(element.start), nameEnd: map(element.nameEnd), openEnd: map(element.openEnd), closeStart: map(element.closeStart), end: map(element.end), tag: element.tag }]);
  }
  return { text: parts.join(""), ranges };
}

/**
 * Replaces source[from, to) and keeps every other range on its element. Positions at `to`
 * move with the inserted text except an element's openEnd when inserting into its empty
 * body, and, for an insertion after an element (`after`), that element's own ends.
 */
function splice(model: SourceModel, from: number, to: number, text: string, added: [string, ElementRange][] = [], after?: string, keep?: string): Splice {
  const delta = text.length - (to - from), removed = detach(model.source.slice(from, to)), boundary = after ? model.ranges.get(after)!.start : Infinity;
  for (const [id, range] of model.ranges) {
    if (from < to && range.start >= from && range.end <= to && id !== keep) { model.ranges.delete(id); continue; }
    if (range.start >= to) range.start += delta;
    if (range.nameEnd >= to) range.nameEnd += delta;
    if (range.openEnd > to || (range.openEnd === to && from < to)) range.openEnd += delta;
    const moveEnd = (position: number) => position > to || (position === to && (from < to || range.start < boundary));
    if (moveEnd(range.closeStart)) range.closeStart += delta;
    if (moveEnd(range.end)) range.end += delta;
  }
  for (const [id, range] of added) model.ranges.set(id, { ...range, start: range.start + from, nameEnd: range.nameEnd + from, openEnd: range.openEnd + from, closeStart: range.closeStart + from, end: range.end + from });
  model.source = model.source.slice(0, from) + text + model.source.slice(to);
  settle(model, from, from + text.length);
  return { from, to: from + text.length, text: removed };
}

const selfClosed = (model: SourceModel, range: ElementRange) => VOID.has(range.tag) || RAW.has(range.tag) || model.source.slice(range.openEnd - 2, range.openEnd) === "/>";

/**
 * Text added or removed where an element was closed implicitly (a <p> ended by the next block)
 * can move that end, as it would for the browser. Rescan just those elements.
 */
function settle(model: SourceModel, from: number, to: number) {
  const affected = [...model.ranges.values()].filter(range => range.closeStart === range.end && (range.end === from || range.end === to) && !selfClosed(model, range)).sort((a, b) => a.start - b.start);
  if (!affected.length) return;
  const byStart = new Map<number, ElementRange>();
  for (const range of model.ranges.values()) byStart.set(range.start, range);
  let settled = -1;
  for (const element of affected) {
    if (element.start < settled) continue;
    let limit = model.source.length, foreign = false;
    for (const other of model.ranges.values()) {
      if (other === element || other.start > element.start || other.end < element.end) continue;
      if (other.closeStart < other.end && other.openEnd <= element.start && other.closeStart >= element.end) limit = Math.min(limit, other.closeStart);
      if (other.tag === "svg" || other.tag === "math") foreign = true;
    }
    for (const scanned of scan(model.source.slice(element.start, limit), false, foreign, true)) {
      const range = byStart.get(scanned.start + element.start);
      if (!range || range.tag !== scanned.tag) continue;
      range.nameEnd = scanned.nameEnd + element.start; range.openEnd = scanned.openEnd + element.start;
      range.closeStart = scanned.closeStart + element.start; range.end = scanned.end + element.start;
    }
    settled = element.end;
  }
}

export function descendants(model: SourceModel, id: string): string[] {
  const range = model.ranges.get(id);
  if (!range) return [];
  const result: string[] = [];
  for (const [other, child] of model.ranges) if (other !== id && child.start >= range.openEnd && child.end <= range.closeStart) result.push(other);
  return result;
}
const sameIds = (left: string[], right: string[]) => left.length === right.length && new Set([...left, ...right]).size === left.length;
const MISMATCH = "This part of the page was changed by its scripts or has markup the visual editor cannot map. Edit it in the source instead.";

/** Replaces an element's content with markup serialized by the preview. */
export function replaceInner(model: SourceModel, id: string, html: string, expected: string[]): SourceEdit {
  const range = model.ranges.get(id);
  if (!range) return { ok: false, error: "The selected element no longer exists in the source." };
  if (range.openEnd === range.end || RAW.has(range.tag) || !sameIds(descendants(model, id), expected)) return { ok: false, error: MISMATCH };
  // SVG and MathML content keeps its self-closing tags.
  let foreign = false;
  for (const other of model.ranges.values()) if ((other.tag === "svg" || other.tag === "math") && other.start <= range.start && other.end >= range.end) { foreign = true; break; }
  const { text, ranges } = parseAnnotated(html, foreign);
  return { ok: true, undo: [splice(model, range.openEnd, range.closeStart, text, ranges)] };
}

/** The element's own line, when only whitespace surrounds it there. */
function ownLine(model: SourceModel, range: ElementRange) {
  const { source } = model;
  let lineStart = range.start;
  while (lineStart > 0 && (source[lineStart - 1] === " " || source[lineStart - 1] === "\t")) lineStart--;
  if (lineStart > 0 && source[lineStart - 1] !== "\n") return null;
  let lineEnd = range.end;
  while (lineEnd < source.length && (source[lineEnd] === " " || source[lineEnd] === "\t" || source[lineEnd] === "\r")) lineEnd++;
  if (lineEnd < source.length && source[lineEnd] !== "\n") return null;
  // Whitespace that belongs to another element, such as an implicitly closed sibling, stays.
  for (const other of model.ranges.values()) {
    if (other.start >= range.start && other.end <= range.end) continue;
    for (const position of [other.start, other.nameEnd, other.openEnd, other.closeStart, other.end])
      if ((position > lineStart && position < range.start) || (position > range.end && position <= lineEnd)) return null;
  }
  return { lineStart, lineEnd: Math.min(source.length, lineEnd + 1), indent: source.slice(lineStart, range.start) };
}

export function removeElement(model: SourceModel, id: string, expected: string[]): SourceEdit {
  const range = model.ranges.get(id);
  if (!range) return { ok: false, error: "The selected element no longer exists in the source." };
  if (!sameIds(descendants(model, id), expected)) return { ok: false, error: MISMATCH };
  const line = ownLine(model, range);
  return { ok: true, undo: [line ? splice(model, line.lineStart, line.lineEnd, "") : splice(model, range.start, range.end, "")] };
}

/** Copies an element's exact source after it; `pairs` maps original ids to the preview's copies. */
export function duplicateElement(model: SourceModel, id: string, pairs: [string, string][]): SourceEdit {
  const range = model.ranges.get(id);
  if (!range) return { ok: false, error: "The selected element no longer exists in the source." };
  if (pairs[0]?.[0] !== id || !sameIds(descendants(model, id), pairs.slice(1).map(([original]) => original))) return { ok: false, error: MISMATCH };
  // A block on its own line gets its copy on the next line with the same indentation.
  const line = ownLine(model, range), prefix = line ? `\n${line.indent}` : "", shift = prefix.length - range.start;
  const added = pairs.map(([original, copy]): [string, ElementRange] => {
    const source = model.ranges.get(original)!;
    return [copy, { ...source, start: source.start + shift, nameEnd: source.nameEnd + shift, openEnd: source.openEnd + shift, closeStart: source.closeStart + shift, end: source.end + shift }];
  });
  return { ok: true, undo: [splice(model, range.end, range.end, prefix + model.source.slice(range.start, range.end), added, id)] };
}

export function retagElement(model: SourceModel, id: string, tag: string): SourceEdit {
  const range = model.ranges.get(id);
  if (!range || !(TEXT_BLOCKS as readonly string[]).includes(range.tag) || !(TEXT_BLOCKS as readonly string[]).includes(tag)) return { ok: false, error: "Only text blocks can change their type." };
  const undo: Splice[] = [], old = range.tag, explicit = range.closeStart < range.end && model.source.slice(range.closeStart + 2, range.closeStart + 2 + old.length).toLowerCase() === old;
  undo.push(splice(model, range.start + 1, range.nameEnd, tag));
  range.tag = tag;
  if (explicit) undo.push(splice(model, range.closeStart + 2, range.closeStart + 2 + old.length, tag));
  // An implied end (such as a <p> closed by the next block) does not apply to the new tag.
  else if (range.closeStart === range.end) undo.push(splice(model, range.end, range.end, `</${tag}>`, [], id));
  return { ok: true, undo };
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const decodeAttribute = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Sets or clears one CSS property in the element's style attribute. */
export function setElementStyle(model: SourceModel, id: string, property: string, value: string): SourceEdit {
  const range = model.ranges.get(id);
  if (!range || !/^[a-z-]+$/.test(property) || /[;"<>]/.test(value)) return { ok: false, error: "Unable to change this style." };
  const tag = model.source.slice(range.start, range.openEnd);
  const match = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag.slice(range.nameEnd - range.start));
  const current = match ? decodeAttribute(match[1] ?? match[2] ?? match[3] ?? "") : "";
  const declarations = current.split(";").map(part => part.trim()).filter(part => part && part.split(":")[0].trim().toLowerCase() !== property);
  if (value) declarations.push(`${property}: ${value}`);
  const style = declarations.join("; "), offset = range.nameEnd - range.start;
  let next: string;
  if (match) {
    const start = offset + match.index, end = start + match[0].length;
    next = tag.slice(0, start) + (style ? ` style="${escapeAttribute(style)}"` : "") + tag.slice(end);
  } else {
    if (!style) return { ok: true, undo: [] };
    next = tag.slice(0, offset) + ` style="${escapeAttribute(style)}"` + tag.slice(offset);
  }
  return { ok: true, undo: [splice(model, range.start, range.openEnd, next, [], undefined, id)] };
}

/** Applies plain text splices in order and returns the splices that reverse them. */
export function applySplices(source: string, splices: Splice[]): { source: string; inverse: Splice[] } {
  const inverse: Splice[] = [];
  for (const { from, to, text } of splices) {
    inverse.unshift({ from, to: from + text.length, text: detach(source.slice(from, to)) });
    source = source.slice(0, from) + text + source.slice(to);
  }
  return { source, inverse };
}
