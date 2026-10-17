import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsageMetrics } from "@shared/usage";
import { TokenMix } from "../Insights";

const summary: UsageMetrics = {
  tokens: { total: 1000, input: 200, cache_read: 400, cache_write: 200, output: 100, reasoning: 100, other: 0 },
  calls: 4, turns: 2, tasks: 2, active_days: 1, running_ms: null, active_ms: null, cost: null, cost_calls: 0, incomplete: false,
};
test("token mix distinguishes total cache share from the input cache ratio and computes per-call usage", () => {
  const html = renderToStaticMarkup(<TokenMix summary={summary} onMetric={() => {}} />);
  expect(html).toContain("40%");
  expect(html).toContain("<b>50%</b>");
  expect(html).toContain("<b>250</b>");
  expect(html).toContain("Cached input: 400");
});
test("an empty token mix has unknown ratios instead of fabricated efficiency", () => {
  const html = renderToStaticMarkup(<TokenMix summary={{ ...summary, calls: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, other: 0 } }} onMetric={() => {}} />);
  expect(html).not.toMatch(/NaN|Infinity|100%/);
  expect(html).toContain("<b>—</b>");
});
