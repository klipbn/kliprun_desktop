import { expect, test } from "bun:test";
import { exactTerminalLinks } from "../terminalLinks";

test("exposes only exact live process to session links", () => {
  const links = exactTerminalLinks(
    new Map([["ses_open", "123"]]),
    [
      { pid: "456", cwd: "/work", rollouts: ["/rollout-a.jsonl"], writerSessionIds: [] },
      { pid: "789", cwd: "/work", rollouts: [], writerSessionIds: [] },
    ],
    [{ id: "a", rollout_path: "/rollout-a.jsonl" }, { id: "b", rollout_path: "/rollout-b.jsonl" }],
  );
  expect(links).toEqual([
    { session_id: "ses_open", pid: 123 },
    { session_id: "codex:a", pid: 456 },
  ]);
});

test("does not expose ambiguous direct Codex links", () => {
  const links = exactTerminalLinks(new Map(), [
    { pid: "456", cwd: "/work", rollouts: ["/rollout-a.jsonl", "/rollout-b.jsonl"] },
  ], [{ id: "a", rollout_path: "/rollout-a.jsonl" }, { id: "b", rollout_path: "/rollout-b.jsonl" }]);
  expect(links).toEqual([]);
});
