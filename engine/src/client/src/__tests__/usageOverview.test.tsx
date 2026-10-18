import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderQuota } from "@shared/quota";
import type { StatsDashboardPayload, UsageMetrics } from "@shared/usage";
import { hasTokenCoverage, providerView, quotaOverview, statisticsHref, usageFilters } from "../quota/overview";
import { TokenSummary, TokenComposition } from "../quota/TokenPanels";

const now = Date.parse("2026-10-15T12:00:00Z");
function quota(provider: ProviderQuota["provider"], remaining: number, status: ProviderQuota["status"] = "ready"): ProviderQuota {
  return { provider, status, plan: null, updated_at: now, message: null, limits: [{ kind: "fiveHour", label: "5-hour", remaining_percent: remaining, reset_at: now + 3600_000, used: null, total: null }] };
}
function dashboard(): StatsDashboardPayload {
  const summary: UsageMetrics = { tokens: { total: 500, input: 100, output: 50, reasoning: 25, cache_read: 100, cache_write: 50, other: 175 }, calls: 10, tasks: 2, turns: 4, active_days: 1, cost: null, cost_calls: 0, incomplete: false, running_ms: null, active_ms: null };
  return { summary, previous: { ...summary, tokens: { ...summary.tokens, total: 400, other: 75 } }, filters: usageFilters("7", "", now, "UTC"), series: [], breakdowns: { source: [], model: [], project: [], agent: [] }, facets: { sources: [], models: [], projects: [], agents: [] }, heatmap: [], token_activity: { daily: [], weekly: [] }, scatter: [], observation_since: null, undated_calls: 0, sources: [{ source: "codex", state: "ready", indexed: 2, total: 2, updated_at: now, skipped: 0, message: null }], generated_at: now };
}

test("subscription health counts current connections without combining percentages or trusting cached resets", () => {
  const openai = quota("openai", 90);
  openai.limits.push({ ...openai.limits[0], kind: "weekly", label: "Weekly", remaining_percent: 0, reset_at: now + 86400_000 });
  const kimi = quota("kimi", 95); kimi.limits[0].reset_at = now - 1;
  const result = quotaOverview({ openai, codex: quota("codex", 80), claude: quota("claude", 99, "stale"), zai: { ...quota("zai", 50, "sign_in_required"), limits: [] }, kimi }, {}, now);
  expect(result.available).toBe(1);
  expect(result.current).toBe(2);
  expect(result.attention.map(item => item.provider)).toEqual(["openai", "zai"]);
  expect(result.resets.map(item => item.provider)).toEqual(["openai", "codex", "openai"]);
  expect(providerView(quota("codex", 80), "Network error", false, now)).toMatchObject({ status: "Cached", live: false, value: 80, tone: "unknown" });
  expect(providerView({ ...openai, limits: [] }, undefined, false, now)).toMatchObject({ status: "Unavailable", live: false, value: null });
});

test("token summary uses exclusive categories, input-cache denominator, per-call usage and measured comparisons", () => {
  const data = dashboard(), html = renderToStaticMarkup(<TokenSummary data={data} period="7" />);
  expect(html).toContain('data-testid="usage-total-tokens" title="500">500');
  expect(html).toContain('data-testid="usage-cache-share">40%');
  expect(html).toContain('data-testid="usage-tokens-per-call">50');
  expect(html).toContain("+25% vs. previous period");
  const mix = renderToStaticMarkup(<TokenComposition data={data} metric="total" onMetric={() => {}} />);
  expect(mix).toContain("Uncached input: 100; Cached input: 100; Cache write: 50; Output: 50; Reasoning: 25; Other: 175");
  expect(renderToStaticMarkup(<TokenSummary data={data} period="all" />)).not.toContain("previous period");
});

test("missing history remains unknown while an indexed empty source can report zero usage", () => {
  const data = dashboard();
  data.summary = { ...data.summary, calls: 0, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, other: 0 } };
  data.sources[0].state = "unavailable";
  expect(hasTokenCoverage(data)).toBe(false);
  expect(renderToStaticMarkup(<TokenSummary data={data} period="7" />)).toContain("Waiting for indexed usage");
  data.sources[0].state = "ready";
  expect(hasTokenCoverage(data)).toBe(true);
  expect(renderToStaticMarkup(<TokenSummary data={data} period="7" />)).toContain('title="0">0');
});

test("history periods use calendar boundaries and drilldowns preserve source and exact model/project filters", () => {
  const filters = usageFilters("today", "codex", now, "UTC");
  expect(filters).toMatchObject({ from: Date.parse("2026-10-15T00:00:00Z"), to: Date.parse("2026-10-16T00:00:00Z"), sources: ["codex"], period: "today" });
  const model = "provider/model + variant", project = "/demo/Project + one";
  const query = new URL(statisticsHref(filters, { models: [model], projects: [project] }), "http://localhost").searchParams;
  expect(query.get("period")).toBe("today"); expect(query.get("source")).toBe("codex"); expect(query.get("model")).toBe(model); expect(query.get("project")).toBe(project);
  const range = new URL(statisticsHref(filters, { from: 0, to: 12345 }, "cache_read"), "http://localhost").searchParams;
  expect(range.get("period")).toBe("custom"); expect(range.get("from")).toBe("0"); expect(range.get("to")).toBe("12345"); expect(range.get("tokenType")).toBe("cache_read");
});
