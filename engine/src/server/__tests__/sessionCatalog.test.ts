import { expect, test } from "bun:test";
import { buildSessionCatalog } from "../usage/catalog";
import type { UsageSession, UsageInterval } from "@shared/usage";

test("catalog keeps unobserved root sessions and unions running time without child usage", () => {
  const sessions: UsageSession[] = ["a", "unknown", "child"].map(id => ({ id, source: "opencode", parent_id: id === "child" ? "a" : null, title: id, directory: "", created_at: 0, updated_at: 1 }));
  const interval = (id: number, start: number, end: number | null, session_id = "a"): UsageInterval => ({ id, session_id, directory: "", column_name: "running", entered_at: start, exited_at: end, duration_ms: null });
  const result = buildSessionCatalog({ sessions, observed_at: 100, intervals: [interval(1, 10, 60), interval(2, 50, null), interval(3, 0, 100, "child")], attributions: [
    { interval_id: 1, start: 10, end: 60, agent: null, model: "long" },
    { interval_id: 2, start: 90, end: 200, agent: null, model: "latest" },
  ] });
  expect(result.sessions).toHaveLength(2);
  expect(result.sessions.find(s => s.id === "a")).toMatchObject({ running_ms: 90, top_model: "long", top_model_ms: 50 });
  expect(result.sessions.find(s => s.id === "unknown")).toMatchObject({ running_ms: null, top_model: null, top_model_ms: null });
});
