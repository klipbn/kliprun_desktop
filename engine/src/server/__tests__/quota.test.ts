import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { QuotaService, registerQuotaRoutes } from "../quota";
import type { ProviderQuota } from "@shared/quota";
import { claudeCredentialLocation } from "../claude/auth";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const now = Date.parse("2026-10-15T12:00:00Z");

function fixture(fetcher: (input: string, init: RequestInit) => Promise<Response>, auth: unknown = {
  openai: { type: "oauth", access: "opencode-secret", accountId: "oc-account" },
  "zai-coding-plan": { type: "api", key: "zai-secret" },
  "kimi-code-plan-global": { type: "oauth", access: "kimi-secret", expires: now + 60_000 },
}, clock: () => number = () => now) {
  const home = mkdtempSync(join(tmpdir(), "kliprun-quota-")); homes.push(home);
  const opencodeAuth = join(home, "opencode-auth.json"), codexAuth = join(home, "codex-auth.json"), claudeAuth = join(home, "claude-auth.json");
  writeFileSync(opencodeAuth, JSON.stringify(auth));
  writeFileSync(codexAuth, JSON.stringify({ tokens: { access_token: "codex-secret", account_id: "cx-account" } }));
  const service = new QuotaService({ opencodeAuth, codexAuth, claudeAuth, fetch: fetcher, now: clock });
  const app = new Hono(); registerQuotaRoutes(app, service);
  return { service, app, opencodeAuth, codexAuth, claudeAuth };
}

test("quota API keeps OpenCode and Codex accounts separate and normalizes each provider's remaining limits", async () => {
  const { app } = fixture((async (input, init) => {
    const url = String(input), headers = new Headers(init?.headers);
    if (url === "https://chatgpt.com/backend-api/wham/usage") {
      const codex = headers.get("Authorization") === "Bearer codex-secret";
      expect(headers.get("ChatGPT-Account-Id")).toBe(codex ? "cx-account" : "oc-account");
      return Response.json({ plan_type: "plus", rate_limit: {
        primary_window: { used_percent: codex ? 12 : 34, limit_window_seconds: 18000, reset_at: now / 1000 + 3600 },
        secondary_window: { used_percent: 100, limit_window_seconds: 604800, reset_after_seconds: 7200 },
      }, spend_control: { individual_limit: { remaining_percent: 65 } } });
    }
    if (url === "https://api.z.ai/api/monitor/usage") {
      expect(headers.get("Authorization")).toBe("Bearer zai-secret");
      return Response.json({ success: true, data: { level: "Pro", limits: [
        { type: "TOKENS_LIMIT", unit: 3, percentage: 25, nextResetTime: now + 1800_000, currentValue: 50, usage: 200 },
        { type: "TOKENS_LIMIT", unit: 6, percentage: 40 },
      ] } });
    }
    expect(url).toBe("https://api.kimi.com/coding/v1/usages");
    expect(headers.get("Authorization")).toBe("Bearer kimi-secret");
    return Response.json({ usage: { used: 200, limit: 1000, resetTime: "2026-10-16T12:00:00Z" },
      limits: [{ window: { duration: 300, timeUnit: "MINUTE" }, detail: { remaining: 75, limit: 100 } }] });
  }));
  const quotas: ProviderQuota[] = [];
  for (const id of ["openai", "codex", "zai", "kimi"]) {
    const response = await app.request(`/api/quota/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    quotas.push(await response.json() as ProviderQuota);
  }
  expect(quotas.map(q => q.status)).toEqual(["ready", "ready", "ready", "ready"]);
  expect(quotas.map(q => q.limits.map(w => w.remaining_percent))).toEqual([[66, 0, 65], [88, 0, 65], [75, 60], [75, 80]]);
  expect(quotas[0].limits[1].reset_at).toBe(now + 7200_000);
  expect(quotas[2].limits[0].reset_at).toBe(now + 1800_000);
  expect(quotas[3].limits[1].reset_at).toBe(now + 86400_000);
  expect(JSON.stringify(quotas)).not.toMatch(/secret|oc-account|cx-account|access_token/);
});

test("quota errors never transport secrets, and stale limits are invalidated when credentials change", async () => {
  let fail = false, calls = 0;
  const { service, opencodeAuth } = fixture((async () => {
    calls++;
    if (fail) return new Response("Bearer opencode-secret -- private upstream response", { status: 503 });
    return Response.json({ rate_limit: { primary_window: { used_percent: 75, limit_window_seconds: 18000 } } });
  }));
  const first = await service.get("openai");
  expect(first.limits[0].remaining_percent).toBe(25);
  expect((await service.get("openai")).status).toBe("ready");
  expect(calls).toBe(1);
  fail = true;
  const stale = await service.get("openai", true);
  expect(stale.status).toBe("stale");
  expect(stale.updated_at).toBe(now);
  expect(stale.limits[0].remaining_percent).toBe(25);
  expect(JSON.stringify(stale)).not.toMatch(/secret|private upstream/);
  writeFileSync(opencodeAuth, JSON.stringify({ openai: { type: "oauth", access: "new-secret" } }));
  const changed = await service.get("openai");
  expect(changed.status).toBe("unavailable");
  expect(changed.limits).toEqual([]);
  writeFileSync(opencodeAuth, "{}");
  expect((await service.get("openai")).status).toBe("not_configured");
});

test("missing and expired sign-ins stay unknown without provider requests", async () => {
  let calls = 0;
  const { service, app, codexAuth } = fixture((async () => { calls++; throw new Error("must not fetch"); }), {
    "kimi-code": { type: "oauth", access: "expired", expires: now - 1 },
    openai: { type: "api", key: "api-only" },
  });
  expect((await service.get("openai")).status).toBe("not_configured");
  expect((await service.get("kimi")).status).toBe("sign_in_required");
  expect((await service.get("zai")).limits).toEqual([]);
  rmSync(codexAuth);
  expect((await service.get("codex")).status).toBe("not_configured");
  expect((await app.request("/api/quota/unknown")).status).toBe(400);
  expect(calls).toBe(0);
});

test("provider failures and malformed percentages never look like a full quota", async () => {
  const { service } = fixture((async (input) => {
    if (String(input).includes("kimi.com")) return Response.json({ usage: { used_percent: null, percentage: "", used: null, limit: 100 },
      limits: [{ window: { duration: 300, timeUnit: "MINUTE" }, detail: { used: "bad", limit: 100 } }] });
    return Response.json({ rate_limit: { primary_window: { used_percent: null, limit_window_seconds: 18000 } } });
  }));
  expect((await service.get("openai")).status).toBe("unavailable");
  expect((await service.get("kimi")).status).toBe("unavailable");
  const { service: denied } = fixture((async () => new Response("codex-secret", { status: 401 })));
  expect((await denied.get("codex")).status).toBe("sign_in_required");
});

test("Z.ai retries the legacy endpoint and raw authorization while Kimi recognizes an untouched window", async () => {
  const attempts: string[] = [];
  const { service } = fixture((async (input, init) => {
    const url = String(input), authorization = new Headers(init?.headers).get("Authorization");
    if (url.includes("kimi.com")) return Response.json({ usage: { remaining: 900, limit: 1000 }, limits: [
      { window: { duration: 5, timeUnit: "HOUR" } },
    ] });
    attempts.push(`${url} ${authorization}`);
    if (url.endsWith("/quota/limit") && authorization === "zai-secret") return Response.json({ limits: [
      { type: "CREDIT_LIMIT", unit: 6, percentage: 110 },
    ] });
    return new Response(null, { status: 401 });
  }));
  expect((await service.get("zai")).limits[0].remaining_percent).toBe(0);
  expect(attempts).toEqual([
    "https://api.z.ai/api/monitor/usage Bearer zai-secret",
    "https://api.z.ai/api/monitor/usage/quota/limit Bearer zai-secret",
    "https://api.z.ai/api/monitor/usage/quota/limit zai-secret",
  ]);
  expect((await service.get("kimi")).limits.map(w => w.remaining_percent)).toEqual([100, 90]);
});

test("overlapping refreshes share one provider request", async () => {
  let calls = 0;
  const { service } = fixture((async () => {
    calls++; await Bun.sleep(15);
    return Response.json({ rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18000 } } });
  }));
  const results = await Promise.all([service.get("openai", true), service.get("openai", true)]);
  expect(calls).toBe(1);
  expect(results.map(q => q.limits[0].remaining_percent)).toEqual([80, 80]);
});

test("Claude OAuth usage exposes remaining 5-hour and weekly limits without returning credentials", async () => {
  const { service, app, claudeAuth } = fixture(async (url, init) => {
    expect(url).toBe("https://api.anthropic.com/api/oauth/usage");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer claude-secret");
    expect(new Headers(init.headers).get("anthropic-beta")).toBe("oauth-2025-04-20");
    expect(init.redirect).toBe("error");
    return Response.json({ five_hour: { utilization: 27.5, resets_at: "2026-10-15T14:00:00Z" },
      seven_day: { utilization: 54, resets_at: "2026-10-20T12:00:00Z" }, seven_day_opus: null });
  });
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", refreshToken: "refresh-secret", expiresAt: now + 3600_000, subscriptionType: "pro" } }));
  const response = await app.request("/api/quota/claude");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const quota = await response.json() as ProviderQuota;
  expect(quota).toMatchObject({ provider: "claude", status: "ready", plan: "Claude Pro", limits: [
    { kind: "fiveHour", remaining_percent: 72.5, reset_at: now + 7200_000 },
    { kind: "weekly", remaining_percent: 46, reset_at: Date.parse("2026-10-20T12:00:00Z") },
  ] });
  expect(JSON.stringify(quota)).not.toMatch(/secret|accessToken|refreshToken/);
  expect(await service.get("claude")).toEqual(quota);
});

test("Claude missing, expired and malformed usage remains unknown without refreshing credentials", async () => {
  let calls = 0;
  const { service, claudeAuth } = fixture(async () => { calls++; return Response.json({ five_hour: { utilization: null }, seven_day: { utilization: "" } }); });
  expect((await service.get("claude")).status).toBe("not_configured");
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "expired", expiresAt: now - 1 } }));
  expect((await service.get("claude")).status).toBe("sign_in_required");
  expect(calls).toBe(0);
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "valid", expiresAt: now + 60_000 } }));
  const quota = await service.get("claude");
  expect(quota.status).toBe("unavailable");
  expect(quota.limits).toEqual([]);
  expect(calls).toBe(1);
});

test("Claude can read its existing macOS Keychain credential and clears cached balances on account changes", async () => {
  const home = mkdtempSync(join(tmpdir(), "kliprun-claude-keychain-")); homes.push(home);
  let token: string | null = "first-secret", denied = false;
  const service = new QuotaService({ claudeAuth: join(home, "absent.json"), now: () => now,
    claudeKeychain: async () => token ? JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt: now + 60_000, subscriptionType: "max" } }) : null,
    fetch: async () => denied ? new Response("private upstream first-secret", { status: 503 }) : Response.json({ five_hour: { utilization: 10, resets_at: null }, seven_day: null }) });
  expect(await service.get("claude")).toMatchObject({ status: "ready", plan: "Claude Max", limits: [{ remaining_percent: 90, reset_at: null }] });
  denied = true;
  const stale = await service.get("claude", true);
  expect(stale).toMatchObject({ status: "stale", limits: [{ remaining_percent: 90 }] });
  expect(JSON.stringify(stale)).not.toMatch(/secret|private upstream/);
  token = "second-secret";
  expect(await service.get("claude")).toMatchObject({ status: "unavailable", limits: [] });
  token = null;
  expect((await service.get("claude")).status).toBe("not_configured");
});

test("Claude secure-storage profiles do not read another config directory's Keychain entry", () => {
  expect(claudeCredentialLocation({}, "/Users/test")).toEqual({ path: "/Users/test/.claude/.credentials.json", service: "Claude Code-credentials" });
  expect(claudeCredentialLocation({ CLAUDE_CONFIG_DIR: "/private/claude" }, "/Users/test")).toEqual({ path: "/private/claude/.credentials.json", service: "Claude Code-credentials-42189441" });
  expect(claudeCredentialLocation({ CLAUDE_CONFIG_DIR: "/private/claude", CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, "/Users/test")).toEqual({ path: "/Users/test/.claude/.credentials.json", service: "Claude Code-credentials" });
});

test("Claude rejected sign-in is reported without exposing the upstream error", async () => {
  const { service, claudeAuth } = fixture(async () => new Response("claude-secret private upstream", { status: 401 }));
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", expiresAt: now + 60_000 } }));
  const quota = await service.get("claude");
  expect(quota).toMatchObject({ status: "sign_in_required", limits: [] });
  expect(JSON.stringify(quota)).not.toMatch(/secret|private upstream/);
});

test("Claude 429 respects Retry-After even for forced and overlapping refreshes, then recovers", async () => {
  let at = now, calls = 0;
  const { service, app, claudeAuth } = fixture(async () => {
    calls++;
    return calls === 1 ? new Response("claude-secret private upstream", { status: 429, headers: { "Retry-After": "900" } })
      : Response.json({ five_hour: { utilization: 20, resets_at: null } });
  }, undefined, () => at);
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", expiresAt: now + 86400_000 } }));
  const first = await service.get("claude");
  expect(first).toMatchObject({ status: "unavailable", limits: [], retry_at: now + 900_000 });
  expect(JSON.stringify(first)).not.toMatch(/secret|private upstream/);
  at = now + 60_000;
  const responses = await Promise.all([service.get("claude"), service.get("claude", true), app.request("/api/quota/claude?refresh=1")]);
  expect(responses[0]).toEqual(first); expect(responses[1]).toEqual(first);
  expect(calls).toBe(1);
  at = now + 899_999; await service.get("claude", true); expect(calls).toBe(1);
  at = now + 900_000;
  expect(await service.get("claude")).toMatchObject({ status: "ready", limits: [{ remaining_percent: 80 }] });
  expect(calls).toBe(2);
});

test("normal Claude polling reuses a successful report for five minutes", async () => {
  let at = now, calls = 0;
  const { service, claudeAuth } = fixture(async () => { calls++; return Response.json({ five_hour: { utilization: 20, resets_at: null } }); }, undefined, () => at);
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", expiresAt: now + 86400_000 } }));
  await service.get("claude");
  at += 60_000; await service.get("claude"); expect(calls).toBe(1);
  at = now + 299_999; await service.get("claude"); expect(calls).toBe(1);
  at = now + 300_000; await service.get("claude"); expect(calls).toBe(2);
});

test("repeated Claude 429 responses back off up to thirty minutes and success resets the delay", async () => {
  let at = now, calls = 0, limited = true;
  const { service, claudeAuth } = fixture(async () => {
    calls++;
    return limited ? new Response(null, { status: 429 }) : Response.json({ five_hour: { utilization: 20, resets_at: null } });
  }, undefined, () => at);
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", expiresAt: now + 86400_000 } }));
  for (const delay of [300_000, 600_000, 1200_000, 1800_000, 1800_000]) {
    const report = await service.get("claude", true), previousCalls = calls;
    expect(report.retry_at).toBe(at + delay);
    at += delay - 1;
    await service.get("claude", true); expect(calls).toBe(previousCalls);
    at++;
  }
  limited = false;
  expect(await service.get("claude")).toMatchObject({ status: "ready", retry_at: null });
  limited = true;
  expect((await service.get("claude", true)).retry_at).toBe(at + 300_000);
});

test("Retry-After accepts an HTTP date and malformed or short delays keep a safe cooldown", async () => {
  for (const [header, delay] of [["Thu, 15 Oct 2026 12:20:00 GMT", 1200_000], ["120", 300_000], ["0", 300_000], ["-5", 300_000], ["not-a-date", 300_000], ["1e999", 300_000], ["1000000000000000000000", 300_000]] as const) {
    const { service, claudeAuth } = fixture(async () => new Response(null, { status: 429, headers: { "Retry-After": header } }));
    writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "claude-secret", expiresAt: now + 86400_000 } }));
    expect((await service.get("claude")).retry_at).toBe(now + delay);
  }
});

test("rate-limited reports preserve old limits only for the same credential and stop endpoint fallbacks", async () => {
  let calls = 0;
  const { service, claudeAuth } = fixture(async () => {
    calls++;
    return calls === 1 ? Response.json({ five_hour: { utilization: 20, resets_at: null } }) : new Response(null, { status: 429 });
  });
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "first-secret", expiresAt: now + 86400_000 } }));
  const first = await service.get("claude");
  expect(await service.get("claude", true)).toMatchObject({ status: "stale", limits: first.limits, updated_at: now, retry_at: now + 300_000 });
  writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: "second-secret", expiresAt: now + 86400_000 } }));
  expect(await service.get("claude")).toMatchObject({ status: "unavailable", limits: [], retry_at: now + 300_000 });
  expect(calls).toBe(3);
  let zaiCalls = 0;
  const zai = fixture(async () => { zaiCalls++; return new Response(null, { status: 429 }); });
  await zai.service.get("zai"); await zai.service.get("zai", true);
  expect(zaiCalls).toBe(1);
});

test("a late response for an old credential cannot erase the current credential's cooldown", async () => {
  let begin!: () => void, release!: () => void, currentCalls = 0;
  const started = new Promise<void>(resolve => { begin = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  const { service, claudeAuth } = fixture(async (_url, init) => {
    if (new Headers(init.headers).get("Authorization") === "Bearer first-secret") {
      begin(); await blocked; return new Response(null, { status: 429 });
    }
    currentCalls++; return new Response(null, { status: 429, headers: { "Retry-After": "900" } });
  });
  const auth = (token: string) => writeFileSync(claudeAuth, JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt: now + 86400_000 } }));
  auth("first-secret"); const previous = service.get("claude"); await started;
  auth("second-secret"); const current = await service.get("claude");
  release(); await previous;
  expect(await service.get("claude", true)).toEqual(current);
  expect(currentCalls).toBe(1);
});
