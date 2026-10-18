import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageDashboard } from "../quota/Usage";
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
