import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageDashboard } from "../quota/Usage";
import { StatusQuota } from "../quota/StatusQuota";
import { quotaOverview } from "../quota/overview";
import type { ProviderQuota } from "@shared/quota";

const now = Date.parse("2026-10-15T12:00:00Z");
const quota: ProviderQuota = { provider: "openai", status: "ready", plan: "ChatGPT Plus", updated_at: now, message: null,
  limits: [
    { kind: "fiveHour", label: "5-hour", remaining_percent: 90, reset_at: now + 3600_000, used: null, total: null },
    { kind: "weekly", label: "Weekly", remaining_percent: 0, reset_at: now + 86400_000, used: null, total: null },
  ] };
function render(quotas: Partial<Record<ProviderQuota["provider"], ProviderQuota>>) {
  return renderToStaticMarkup(<UsageDashboard quotas={quotas} pending={[]} errors={{}} now={now} onRefresh={() => {}} />);
}

test("Usage shows the most restrictive window and marks exhausted providers", () => {
  const html = render({ openai: quota });
  expect(html).toContain('aria-label="OpenAI · OpenCode: 0% remaining"');
  expect(html).toContain('aria-label="5-hour: 90% remaining"');
  expect(html).toContain('aria-label="Weekly: 0% remaining"');
  expect(html).toContain("Resets in 1h");
  expect(html).toContain('aria-label="Limit reached: 0% remaining"');
});

test("unavailable and stale providers remain visible with their status", () => {
  const html = render({
    openai: { ...quota, status: "stale", message: "Provider is temporarily unavailable." },
    codex: { ...quota, provider: "codex", status: "not_configured", limits: [], updated_at: null, message: "Sign in with ChatGPT in Codex." },
  });
  expect(html).toContain("Cached");
  expect(html).toContain("Sign in with ChatGPT in Codex.");
  expect(html).toContain("Z.ai");
  expect(html).toContain("Kimi");
  expect(html).not.toContain("100%");
});

test("an elapsed reset does not claim fresh capacity or keep a past countdown", () => {
  const html = render({ openai: { ...quota, limits: [{ ...quota.limits[0], reset_at: now - 1 }] } });
  expect(html).toContain("Reset pending");
  expect(html).not.toContain("Resets in -");
});

test("Usage includes Claude Code with its independent subscription windows", () => {
  const html = render({ claude: { ...quota, provider: "claude", plan: "Claude Pro" } });
  expect(html).toContain('data-provider="claude"');
  expect(html).toContain('aria-label="Claude Code: 0% remaining"');
  expect(html).toContain("Via Claude Code");
  expect(html).toContain('aria-label="5-hour: 90% remaining"');
});

test("a ready response without any windows cannot claim available subscription capacity", () => {
  const html = render({ openai: { ...quota, limits: [] } });
  expect(html).not.toContain('aria-label="Available"');
  expect(html).toContain("No limit windows returned");
});

test("Usage shows a rate-limit cooldown while retaining the last known balance", () => {
  const html = render({ claude: { ...quota, provider: "claude", status: "stale", retry_at: now + 300_000, message: "Provider is rate limiting usage checks. Automatic retries are paused." } });
  expect(html).toContain("Retry in 5m");
  expect(html).toContain("Automatic retries are paused");
  expect(html).toContain('aria-label="Claude Code: 0% remaining"');
  expect(render({ claude: { ...quota, provider: "claude", status: "stale", retry_at: now - 1 } })).toContain("Retry available");
});

test("Usage limits and the status strip show only selected providers in their configured order", () => {
  const quotas = { openai: quota, codex: {...quota,provider:'codex' as const}, claude:{...quota,provider:'claude' as const} };
  const html = renderToStaticMarkup(<UsageDashboard providers={['claude','codex']} quotas={quotas} pending={[]} errors={{}} now={now} onRefresh={()=>{}}/>);
  expect(html).not.toContain('data-provider="openai"');
  expect(html).not.toContain('data-provider="kimi"');
  expect(html.indexOf('data-provider="claude"')).toBeLessThan(html.indexOf('data-provider="codex"'));
  const strip = renderToStaticMarkup(<StatusQuota providers={['claude','codex']} quotas={quotas} pending={[]} errors={{}} now={now} onOpen={()=>{}}/>);
  expect(strip).not.toContain('OpenAI · OpenCode');
  expect(strip.indexOf('Claude Code')).toBeLessThan(strip.indexOf('OpenAI · Codex'));
  expect(quotaOverview(quotas,{},now,['codex']).attention.map(v=>v.provider)).toEqual(['codex']);
  expect(quotaOverview(quotas,{},now,['codex']).resets.every(v=>v.provider==='codex')).toBe(true);
});

test("disabling all limits leaves token history available and removes the status strip",()=>{
  const html=renderToStaticMarkup(<UsageDashboard providers={[]} quotas={{openai:quota}} pending={[]} errors={{}} now={now} onRefresh={()=>{}}/>);
  expect(html).toContain('No providers selected');
  expect(html).not.toContain('class="usage-provider"');
  expect(html).toContain('Token usage period');
  expect(html).toContain('Explore Statistics');
  expect(renderToStaticMarkup(<StatusQuota providers={[]} quotas={{openai:quota}} pending={[]} errors={{}} now={now} onOpen={()=>{}}/>)).toBe('');
});
