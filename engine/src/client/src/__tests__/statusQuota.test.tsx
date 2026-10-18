import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusQuota } from "../quota/StatusQuota";
import type { ProviderQuota } from "@shared/quota";

const now = Date.parse("2026-10-15T12:00:00Z");
const quota: ProviderQuota = { provider: "codex", status: "ready", plan: "Plus", updated_at: now, message: null,
  limits: [
    { kind: "weekly", label: "Weekly", remaining_percent: 0, reset_at: now + 86400_000, used: null, total: null },
    { kind: "fiveHour", label: "5-hour", remaining_percent: 72.4, reset_at: now + 3600_000, used: null, total: null },
  ] };

test("footer shows independent remaining percentages including an exhausted weekly limit", () => {
  const html = renderToStaticMarkup(<StatusQuota quotas={{ codex: quota }} errors={{}} pending={[]} now={now} onOpen={() => {}} />);
  expect(html).toContain('aria-label="OpenAI · Codex 5-hour: 72.4% remaining"');
  expect(html).toContain('aria-label="OpenAI · Codex Weekly: 0% remaining"');
  expect(html.indexOf("5h")).toBeLessThan(html.indexOf("7d"));
  expect(html).toContain("72.4%");
  expect(html).toContain("0%");
  expect(html).toContain("Resets in 1h");
});

test("footer labels old balances and never presents them as healthy live limits", () => {
  for (const state of [
    { quota: { ...quota, status: "stale" as const }, errors: {}, label: "Cached" },
    { quota, errors: { codex: "Network unavailable" }, label: "Cached" },
    { quota: { ...quota, limits: [{ ...quota.limits[1], reset_at: now - 1 }] }, errors: {}, label: "Reset pending" },
  ]) {
    const html = renderToStaticMarkup(<StatusQuota quotas={{ codex: state.quota }} errors={state.errors} pending={[]} now={now} onOpen={() => {}} />);
    expect(html).toContain(state.label);
    expect(html).toContain("72.4%");
    expect(html).toContain('data-tone="unknown"');
    expect(html).not.toContain('data-tone="healthy"');
  }
});

test("footer omits disconnected providers and missing windows without inventing capacity", () => {
  const html = renderToStaticMarkup(<StatusQuota quotas={{
    codex: { ...quota, limits: [quota.limits[1]] },
    openai: { ...quota, provider: "openai", status: "not_configured", limits: [] },
    kimi: { ...quota, provider: "kimi", status: "sign_in_required", limits: [] },
  }} errors={{}} pending={[]} now={now} onOpen={() => {}} />);
  expect(html).not.toContain("7d");
  expect(html).not.toContain("OpenAI OC");
  expect(html).toContain("Sign in required");
  expect(html).not.toContain("100%");
});

test("footer provides a Usage entry when no balances are connected", () => {
  const html = renderToStaticMarkup(<StatusQuota quotas={{}} errors={{}} pending={[]} now={now} onOpen={() => {}} />);
  expect(html).toContain(">Usage</button>");
  expect(html).not.toContain('role="meter"');
});

test("footer exposes the cooldown without marking cached limits as current", () => {
  const html = renderToStaticMarkup(<StatusQuota quotas={{ claude: { ...quota, provider: "claude", status: "stale", retry_at: now + 300_000 } }} errors={{}} pending={[]} now={now} onOpen={() => {}} />);
  expect(html).toContain("Retry in 5m");
  expect(html).toContain("Cached");
  expect(html).not.toContain('data-tone="healthy"');
});

test("footer shows Claude after Codex and opens Usage with its own limits", () => {
  const html = renderToStaticMarkup(<StatusQuota quotas={{ codex: quota, claude: { ...quota, provider: "claude" } }} errors={{}} pending={[]} now={now} onOpen={() => {}} />);
  expect(html).toContain('aria-label="Claude Code 5-hour: 72.4% remaining"');
  expect(html).toContain('aria-label="Claude Code Weekly: 0% remaining"');
  expect(html).toContain('aria-label="Claude Code. Open Usage"');
  expect(html.indexOf('Codex</span>')).toBeLessThan(html.indexOf('Claude</span>'));
});
