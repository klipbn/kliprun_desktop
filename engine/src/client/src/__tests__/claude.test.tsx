import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardPayload } from "@shared/types";
import { SessionCard } from "../components/SessionCard";
import { sourceName } from "../statistics/format";
import { parseFilters } from "../statistics/filters";

test("Claude cards identify the harness and keep an unresolved status distinct from completion", () => {
  const card: CardPayload = { source: "claude", session_id: "claude-terminal:42", title: "Claude Code · demo", directory: "/demo", directory_name: "demo", prompt_snippet: null,
    parent_id: null, agent: { name: "Claude Code" }, column: "idle", stage: "Status unknown", stage_since: 0, running_since: null, last_event_at: 0,
    reason: null, error: null, last_tool: null, message_count: 0, finished_at: null, tokens_total: null, model_ref: null, context: null,
    branch: null, mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0, subagent_error_notes: [], children: [],
    terminal: { pid: 42, generation: "g", session_id: null, candidates: [] } };
  const html = renderToStaticMarkup(<SessionCard card={card} depth={0} selectedId={null} activeTerminalId={null} now={0} isRead={() => false} priorities={{}} onPriorityChange={() => {}} onSelect={() => {}} />);
  expect(html).toContain('harness-icon-claude');
  expect(html).toContain('aria-label="Status unknown"');
  expect(html).not.toContain('OpenCode');
  expect(sourceName("claude")).toBe("Claude Code");
  expect(parseFilters("?source=claude").sources).toEqual(["claude"]);
});
