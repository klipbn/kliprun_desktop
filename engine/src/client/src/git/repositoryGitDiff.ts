import { StateEffect, StateField, Text, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, WidgetType, gutter } from "@codemirror/view";
import { Chunk } from "@codemirror/merge";

export interface RepositoryGitHunk {
  from: number; to: number; line: number; kind: "added" | "modified" | "deleted";
  before: string; after: string; additions: number; deletions: number;
  oldRanges: Array<{ from: number; to: number }>; newRanges: Array<{ from: number; to: number }>;
}
const DIFF_LIMIT = 512 * 1024;
const lines = (text: string) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;
const encoder = new TextEncoder();
const exceedsLimit = (original: string, document: Text) => original.length > DIFF_LIMIT || document.length > DIFF_LIMIT ||
  encoder.encode(original).length > DIFF_LIMIT || encoder.encode(document.toString()).length > DIFF_LIMIT;

export function repositoryGitHunks(original: string, document: Text): RepositoryGitHunk[] {
  if (exceedsLimit(original, document)) return [];
  const base = Text.of(original.split(/\r?\n/));
  return Chunk.build(base, document, { scanLimit: 500, timeout: 25 }).map(chunk => {
    const from = Math.min(chunk.fromB, document.length);
    const before = base.sliceString(chunk.fromA, Math.min(chunk.toA, base.length));
    const after = document.sliceString(from, Math.min(chunk.toB, document.length));
    return {
      from, to: Math.min(chunk.toB, document.length + 1), line: document.lineAt(from).number,
      kind: !before ? "added" : !after ? "deleted" : "modified",
      before, after, additions: lines(after), deletions: lines(before),
      oldRanges: chunk.changes.map(change => ({ from: change.fromA, to: change.toA })),
      newRanges: chunk.changes.map(change => ({ from: change.fromB, to: change.toB })),
    };
  });
}

export const setRepositoryGitBase = StateEffect.define<string | null>();
export const expandRepositoryGitHunks = StateEffect.define<"all" | "none" | number>();
export const repositoryGitState = StateField.define<{
  base: string | null; hunks: RepositoryGitHunk[]; expanded: Set<number>; all: boolean; limited: boolean;
}>({
  create: () => ({ base: null, hunks: [], expanded: new Set(), all: false, limited: false }),
  update(value, transaction) {
    let base = value.base;
    for (const effect of transaction.effects) if (effect.is(setRepositoryGitBase)) base = effect.value;
    const changed = transaction.docChanged || base !== value.base;
    let expanded = changed ? new Set([...value.expanded].map(position => transaction.changes.mapPos(position, -1))) : value.expanded;
    let all = value.all;
    const hunks = changed ? base === null ? [] : repositoryGitHunks(base, transaction.state.doc) : value.hunks;
    if (base !== value.base) { expanded = new Set(); all = false; }
    let touched = changed;
    for (const effect of transaction.effects) if (effect.is(expandRepositoryGitHunks)) {
      touched = true;
      if (effect.value === "all" || effect.value === "none") { all = effect.value === "all"; expanded = new Set(); }
      else {
        expanded = all ? new Set(hunks.map(hunk => hunk.from)) : new Set(expanded);
        all = false;
        if (expanded.has(effect.value)) expanded.delete(effect.value); else expanded.add(effect.value);
      }
    }
    return touched ? { base, hunks, expanded, all, limited: base !== null && exceedsLimit(base, transaction.state.doc) } : value;
  },
});

export function repositoryGitSummary(state: EditorState) {
  const value = state.field(repositoryGitState);
  return { hunks: value.hunks.length, additions: value.hunks.reduce((sum, hunk) => sum + hunk.additions, 0),
    deletions: value.hunks.reduce((sum, hunk) => sum + hunk.deletions, 0),
    expanded: value.hunks.filter(hunk => value.all || value.expanded.has(hunk.from)).length, limited: value.limited };
}

class ChangeMarker extends GutterMarker {
  constructor(readonly hunk: RepositoryGitHunk, readonly expanded: boolean) { super(); }
  eq(other: ChangeMarker) { return this.hunk.from === other.hunk.from && this.hunk.line === other.hunk.line && this.hunk.kind === other.hunk.kind && this.hunk.additions === other.hunk.additions && this.hunk.deletions === other.hunk.deletions && this.expanded === other.expanded; }
  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button"; button.className = `cm-git-marker is-${this.hunk.kind}`;
    button.setAttribute("aria-label", `${this.expanded ? "Hide" : "Show"} ${this.hunk.kind} changes at line ${this.hunk.line}`);
    button.setAttribute("aria-expanded", String(this.expanded));
    button.title = `${this.hunk.kind[0].toUpperCase() + this.hunk.kind.slice(1)} · +${this.hunk.additions} −${this.hunk.deletions}`;
    button.onclick = event => { event.preventDefault(); event.stopPropagation(); view.dispatch({ effects: expandRepositoryGitHunks.of(this.hunk.from) }); view.focus(); };
    return button;
  }
}

class ChangeWidget extends WidgetType {
  constructor(readonly hunk: RepositoryGitHunk) { super(); }
  eq(other: ChangeWidget) { return this.hunk.from === other.hunk.from && this.hunk.line === other.hunk.line && this.hunk.before === other.hunk.before && this.hunk.after === other.hunk.after; }
  toDOM(view: EditorView) {
    const container = document.createElement("div"); container.className = "cm-git-diff-widget";
    container.setAttribute("role", "region"); container.setAttribute("aria-label", `Changes at line ${this.hunk.line}`);
    const panel = container.appendChild(document.createElement("div")); panel.className = "cm-git-diff-panel";
    const header = panel.appendChild(document.createElement("div")); header.className = "cm-git-diff-header";
    const title = header.appendChild(document.createElement("span")); title.textContent = `Line ${this.hunk.line} · +${this.hunk.additions} −${this.hunk.deletions}`;
    const close = header.appendChild(document.createElement("button")); close.type = "button"; close.textContent = "×";
    close.setAttribute("aria-label", "Hide this change"); close.title = "Hide this change (Esc)";
    close.onclick = () => { view.dispatch({ effects: expandRepositoryGitHunks.of(this.hunk.from) }); view.focus(); };
    const side = (text: string, ranges: Array<{ from: number; to: number }>, label: string, className: string) => {
      if (!text) return;
      const block = panel.appendChild(document.createElement("div")); block.className = className;
      const caption = block.appendChild(document.createElement("div")); caption.className = "cm-git-diff-caption"; caption.textContent = label;
      const pre = block.appendChild(document.createElement("pre")); let offset = 0;
      for (const range of ranges) {
        const from = Math.max(offset, Math.min(range.from, text.length)), to = Math.min(range.to, text.length);
        pre.append(document.createTextNode(text.slice(offset, from)));
        if (to > from) { const mark = pre.appendChild(document.createElement("mark")); mark.textContent = text.slice(from, to); }
        offset = Math.max(from, to);
      }
      pre.append(document.createTextNode(text.slice(offset)));
    };
    side(this.hunk.before, this.hunk.oldRanges, "− HEAD", "cm-git-diff-old");
    side(this.hunk.after, this.hunk.newRanges, "+ Current", "cm-git-diff-new");
    return container;
  }
}

export const repositoryGitDiff = [repositoryGitState,
  gutter({
    class: "cm-git-gutter", renderEmptyElements: true,
    lineMarker(view, line) {
      const value = view.state.field(repositoryGitState);
      const hunk = value.hunks.find(hunk => hunk.kind === "deleted" ? line.from === view.state.doc.lineAt(hunk.from).from : line.from >= hunk.from && line.from < hunk.to);
      return hunk ? new ChangeMarker(hunk, value.all || value.expanded.has(hunk.from)) : null;
    },
    lineMarkerChange: update => update.startState.field(repositoryGitState) !== update.state.field(repositoryGitState),
  }),
  EditorView.decorations.compute([repositoryGitState], state => {
    const value = state.field(repositoryGitState);
    return Decoration.set(value.hunks.filter(hunk => value.all || value.expanded.has(hunk.from)).map(hunk =>
      Decoration.widget({ widget: new ChangeWidget(hunk), block: true, side: -1 }).range(state.doc.lineAt(hunk.from).from)), true);
  }),
];
