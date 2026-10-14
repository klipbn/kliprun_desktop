import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardPayload } from "@shared/types";
import { SessionCard } from "../components/SessionCard";

const card = {
  session_id: "codex:session-1", source: "codex", title: "Codex session", column: "running",
  stage: "Working", agent: { name: "Codex" }, directory: "/work", directory_name: "work",
  children: [], mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0,
  subagent_error_notes: [], model_ref: null, context: null, error: null, reason: null,
  branch: null, tokens_total: null, finished_at: null, running_since: null,
  stage_since: null, last_event_at: null,
} as unknown as CardPayload;

test("active terminal card stands out even when its details are closed", () => {
  const html = renderToStaticMarkup(<SessionCard card={card} depth={0} selectedId={null}
    activeTerminalId={card.session_id} now={0} isRead={() => false} onSelect={() => {}} />);
  expect(html).toContain('data-testid="active-terminal-badge"');
  expect(html).toContain("ring-2 ring-accent");
});
