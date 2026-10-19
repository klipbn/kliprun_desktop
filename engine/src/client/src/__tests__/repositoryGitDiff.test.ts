import { expect, test } from "bun:test";
import { Text, type StateCommand } from "@codemirror/state";
import { undo, redo, undoDepth } from "@codemirror/commands";
import { createRepositoryEditorState } from "../git/repositoryCodeEditor";
import { expandRepositoryGitHunks, repositoryGitDiff, repositoryGitHunks, repositoryGitState, repositoryGitSummary, setRepositoryGitBase } from "../git/repositoryGitDiff";

test("Git hunks distinguish added, modified and deleted lines including EOF and empty files", () => {
  for (const [before, after, kind, line, additions, deletions] of [
    ["keep\n", "keep\nadded\n", "added", 2, 1, 0],
    ["keep\nold\nend\n", "keep\nnew\nend\n", "modified", 2, 1, 1],
    ["keep\nremoved\n", "keep\n", "deleted", 2, 0, 1],
    ["removed", "", "deleted", 1, 0, 1],
    ["", "added", "added", 1, 1, 0],
  ] as const) {
    const hunks = repositoryGitHunks(before, Text.of(after.split("\n")));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ kind, line, additions, deletions });
    expect(hunks[0]!.from).toBeLessThanOrEqual(after.length);
  }
});

test("unchanged CRLF text and Unicode are not marked as edits and word ranges retain exact text", () => {
  expect(repositoryGitHunks("a\r\nb\r\n", Text.of(["a", "b", ""]))).toEqual([]);
  expect(repositoryGitHunks("a\rb\r", Text.of(["a\rb\r"]))).toEqual([]);
  const hunk = repositoryGitHunks("hello 🌍 old\n", Text.of(["hello 🌍 new", ""]))[0]!;
  expect(hunk.before).toBe("hello 🌍 old\n"); expect(hunk.after).toBe("hello 🌍 new\n");
  expect(hunk.oldRanges.some(range => hunk.before.slice(range.from, range.to).includes("old"))).toBe(true);
  expect(hunk.newRanges.some(range => hunk.after.slice(range.from, range.to).includes("new"))).toBe(true);
});

test("review expansion and HEAD refresh preserve document contents, undo and redo", () => {
  let state = createRepositoryEditorState("file.py", "keep\n", repositoryGitDiff);
  const run = (command: StateCommand) => command({ get state() { return state; }, dispatch: transaction => { state = transaction.state; } });
  state = state.update({ effects: setRepositoryGitBase.of("keep\n") }).state;
  state = state.update({ changes: { from: state.doc.length, insert: "added\n" }, userEvent: "input.type" }).state;
  expect(repositoryGitSummary(state)).toMatchObject({ hunks: 1, additions: 1, deletions: 0, expanded: 0 });
  const depth = undoDepth(state);
  state = state.update({ effects: expandRepositoryGitHunks.of("all") }).state;
  expect(repositoryGitSummary(state).expanded).toBe(1);
  state = state.update({ effects: expandRepositoryGitHunks.of("none") }).state;
  expect(state.sliceDoc()).toBe("keep\nadded\n"); expect(undoDepth(state)).toBe(depth);
  expect(run(undo)).toBe(true); expect(state.sliceDoc()).toBe("keep\n"); expect(repositoryGitSummary(state).hunks).toBe(0);
  expect(run(redo)).toBe(true); expect(state.sliceDoc()).toBe("keep\nadded\n");
  state = state.update({ effects: setRepositoryGitBase.of("keep\nadded\n") }).state;
  expect(repositoryGitSummary(state).hunks).toBe(0); expect(undoDepth(state)).toBe(depth);
});

test("hunks update with unsaved edits and changing a single expansion does not change source", () => {
  let state = createRepositoryEditorState("file.txt", "new\nkeep\n", repositoryGitDiff);
  state = state.update({ effects: setRepositoryGitBase.of("old\nkeep\n") }).state;
  const position = state.field(repositoryGitState).hunks[0]!.from;
  state = state.update({ effects: expandRepositoryGitHunks.of(position) }).state;
  expect(repositoryGitSummary(state).expanded).toBe(1);
  state = state.update({ changes: { from: 0, to: 3, insert: "newer" } }).state;
  expect(state.field(repositoryGitState).hunks[0]!.after).toBe("newer\n");
  expect(state.sliceDoc()).toBe("newer\nkeep\n");
});

test("missing and oversized baselines leave the editor usable without invented changes", () => {
  let state = createRepositoryEditorState("file.txt", "current", repositoryGitDiff);
  expect(repositoryGitSummary(state).hunks).toBe(0);
  state = state.update({ effects: setRepositoryGitBase.of("x".repeat(512 * 1024 + 1)) }).state;
  expect(repositoryGitSummary(state)).toMatchObject({ hunks: 0, limited: true });
  state = state.update({ effects: setRepositoryGitBase.of(null) }).state;
  expect(repositoryGitSummary(state)).toMatchObject({ hunks: 0, limited: false }); expect(state.sliceDoc()).toBe("current");
});

test("a new HEAD collapses old review blocks without changing the current draft", () => {
  let state = createRepositoryEditorState("file.txt", "current\n", repositoryGitDiff);
  state = state.update({ effects: setRepositoryGitBase.of("old\n") }).state;
  state = state.update({ effects: expandRepositoryGitHunks.of("all") }).state;
  expect(repositoryGitSummary(state).expanded).toBe(1);
  state = state.update({ effects: setRepositoryGitBase.of("another base\n") }).state;
  expect(repositoryGitSummary(state)).toMatchObject({ hunks: 1, expanded: 0 });
  expect(state.sliceDoc()).toBe("current\n");
});

test("the diff limit counts UTF-8 bytes for large unsaved Unicode drafts", () => {
  let state = createRepositoryEditorState("file.txt", "🌍".repeat(140_000), repositoryGitDiff);
  state = state.update({ effects: setRepositoryGitBase.of("") }).state;
  expect(repositoryGitSummary(state)).toMatchObject({ hunks: 0, limited: true });
  expect(state.doc.length).toBe(280_000);
});
