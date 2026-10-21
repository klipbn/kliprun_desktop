import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

export interface LinkedRange { from: number; to: number }

// The source of the element selected in the visual editor, marked even while the preview has focus.
export const setLinkedElement = StateEffect.define<LinkedRange | null>();
const linkedRange = StateField.define<LinkedRange | null>({
  create: () => null,
  update(value, transaction) {
    if (value && transaction.docChanged) value = { from: transaction.changes.mapPos(value.from), to: transaction.changes.mapPos(value.to, 1) };
    for (const effect of transaction.effects) if (effect.is(setLinkedElement)) value = effect.value;
    return value;
  },
});
const linkedMark = Decoration.mark({ class: "cm-linked-element" });
export const linkedElement: Extension = [linkedRange, EditorView.decorations.compute([linkedRange], state => {
  const range = state.field(linkedRange);
  return range && range.to > range.from ? Decoration.set([linkedMark.range(range.from, range.to)]) : Decoration.none;
})];

/** Lines longer than this, such as embedded data or minified scripts, are shown in part. */
export const LONG_LINE = 20_000;
const CONTEXT = 4_000;
const TAIL = 400;

const formatSize = (characters: number) => characters >= 1024 * 1024 ? `${(characters / 1024 / 1024).toFixed(1)} M characters` : `${Math.round(characters / 1024)} K characters`;
class HiddenText extends WidgetType {
  constructor(readonly size: number) { super(); }
  eq(other: HiddenText) { return other.size === this.size; }
  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-hidden-text";
    element.textContent = `… ${formatSize(this.size)} hidden …`;
    element.title = "Part of a very long line is hidden to keep the editor responsive. Place the cursor next to it to show more.";
    return element;
  }
  ignoreEvent() { return false; }
}

/** Start offsets of the long lines, rescanned only when the text changes. */
const longLines = StateField.define<number[]>({
  create: state => findLongLines(state),
  update: (value, transaction) => transaction.docChanged ? findLongLines(transaction.state) : value,
});
function findLongLines(state: EditorState) {
  const { doc } = state, starts: number[] = [];
  if (doc.length <= LONG_LINE) return starts;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    if (line.length > LONG_LINE) starts.push(line.from);
  }
  return starts;
}

/** Hidden parts of long lines; the start, the end, the cursor and the linked element stay visible. */
export function hiddenLongLineRanges(state: EditorState): [number, number][] {
  const starts = state.field(longLines, false) ?? findLongLines(state);
  if (!starts.length) return [];
  // Only the ends of a selection stay visible, so selecting across a long line never renders all of it.
  const ends = state.selection.ranges.flatMap(range => [range.anchor, range.head]);
  const linked = state.field(linkedRange, false);
  if (linked) ends.push(linked.from, linked.to);
  const keep = ends.map((position): [number, number] => [position - CONTEXT, position + CONTEXT]);
  const hidden: [number, number][] = [];
  for (const start of starts) {
    const line = state.doc.lineAt(start);
    const visible = [[line.from, line.from + CONTEXT], [line.to - TAIL, line.to], ...keep]
      .map(([from, to]) => [Math.max(line.from, from), Math.min(line.to, to)] as [number, number]).filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
    let cursor = line.from;
    for (const [from, to] of visible) {
      if (from - cursor > CONTEXT / 4) hidden.push([cursor, from]);
      cursor = Math.max(cursor, to);
    }
    if (line.to - cursor > CONTEXT / 4) hidden.push([cursor, line.to]);
  }
  return hidden;
}

export const longLineFolding: Extension = [longLines, EditorView.decorations.compute([longLines, "selection", linkedRange], state => {
  const ranges = hiddenLongLineRanges(state);
  if (!ranges.length) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const [from, to] of ranges) builder.add(from, to, Decoration.replace({ widget: new HiddenText(to - from) }));
  return builder.finish();
}), EditorView.baseTheme({
  ".cm-hidden-text": { padding: "0 6px", margin: "0 2px", borderRadius: "3px", fontStyle: "italic", opacity: 0.75, background: "color-mix(in srgb, currentColor 12%, transparent)" },
})];
