import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { QuotaService, registerQuotaRoutes } from "../quota";
import type { ProviderQuota } from "@shared/quota";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const now = Date.parse("2026-10-15T12:00:00Z");

function fixture(fetcher: (input: string, init: RequestInit) => Promise<Response>, auth: unknown = {
  openai: { type: "oauth", access: "opencode-secret", accountId: "oc-account" },
  "zai-coding-plan": { type: "api", key: "zai-secret" },
  "kimi-code-plan-global": { type: "oauth", access: "kimi-secret", expires: now + 60_000 },
}) {
  const home = mkdtempSync(join(tmpdir(), "kliprun-quota-")); homes.push(home);
  const opencodeAuth = join(home, "opencode-auth.json"), codexAuth = join(home, "codex-auth.json");
  writeFileSync(opencodeAuth, JSON.stringify(auth));
  writeFileSync(codexAuth, JSON.stringify({ tokens: { access_token: "codex-secret", account_id: "cx-account" } }));
  const service = new QuotaService({ opencodeAuth, codexAuth, fetch: fetcher, now: () => now });
  const app = new Hono(); registerQuotaRoutes(app, service);
  return { service, app, opencodeAuth, codexAuth };
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
