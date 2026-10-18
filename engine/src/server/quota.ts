import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Hono } from "hono";
import { QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider, type QuotaWindow } from "@shared/quota";
import { codexHome } from "./codex/storage";
import { getDbPath } from "./storage/db";
import { claudeCredentialLocation, readClaudeKeychain } from "./claude/auth";

type ObjectValue = Record<string, unknown>;
type Credential = { token: string; account: string | null; expires: number | null; plan?: string | null };
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type Options = { opencodeAuth?: string; codexAuth?: string; claudeAuth?: string; claudeKeychain?: () => Promise<string | null>; fetch?: Fetcher; now?: () => number };
const OPENAI_URL = "https://chatgpt.com/backend-api/wham/usage";
const ZAI_URL = "https://api.z.ai/api/monitor/usage";
const KIMI_URL = "https://api.kimi.com/coding/v1/usages";
const CLAUDE_URL = "https://api.anthropic.com/api/oauth/usage";
const KIMI_KEYS = ["kimi-for-coding", "kimi-for-coding-oauth", "kimi-code", "kimi", "kimi-code-plan-global", "kimi-code-plan-cn"];
const object = (v: unknown): ObjectValue => v !== null && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
function numeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
const percentage = (v: unknown): number | null => { const n = numeric(v); return n === null ? null : Math.max(0, Math.min(100, n)); };

function jwtAccount(token: string): string | null {
  try {
    const claims = object(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()));
    return text(object(claims["https://api.openai.com/auth"]).chatgpt_account_id);
  } catch { return null; }
}

function credentials(auth: ObjectValue, provider: QuotaProvider): Credential | null {
  if (provider === "claude") {
    const oauth = object(auth.claudeAiOauth), token = text(oauth.accessToken);
    const plans: Record<string, string> = { pro: "Claude Pro", max: "Claude Max", team: "Claude Team", enterprise: "Claude Enterprise" };
    return token ? { token, account: null, expires: numeric(oauth.expiresAt), plan: plans[text(oauth.subscriptionType) ?? ""] ?? null } : null;
  }
  if (provider === "codex") {
    const tokens = object(auth.tokens), token = text(tokens.access_token);
    return token ? { token, account: text(tokens.account_id) ?? jwtAccount(token), expires: null } : null;
  }
  const keys = provider === "openai" ? ["openai", "codex", "chatgpt", "opencode"]
    : provider === "zai" ? ["zai-coding-plan", "zai"]
      : [...KIMI_KEYS, ...Object.keys(auth).filter(key => !KIMI_KEYS.includes(key) && /^kimi([-_]|$)/i.test(key))];
  // Kimi accepts both API keys and OAuth; keep the extension's API-key priority.
  const types = provider === "openai" ? ["oauth"] : provider === "zai" ? ["api"] : ["api", "oauth"];
  for (const type of types) for (const key of keys) {
    const entry = object(auth[key]);
    if (entry.type !== type) continue;
    const token = text(type === "api" ? entry.key : entry.access);
    if (token) return { token, account: provider === "openai" ? jwtAccount(token) ?? text(entry.accountId) : null,
      expires: type === "oauth" ? numeric(entry.expires) : null };
  }
  return null;
}

function epoch(value: unknown, scale?: number): number | null {
  const n = numeric(value);
  if (n === null || n <= 0) return null;
  const at = n * (scale ?? (n < 10_000_000_000 ? 1000 : 1));
  return Number.isFinite(new Date(at).getTime()) ? at : null;
}

function resetAt(detail: ObjectValue, now: number): number | null {
  for (const key of ["resetTime", "reset_time", "resetAt", "reset_at"]) {
    const value = detail[key];
    const at = numeric(value) !== null ? epoch(value) : typeof value === "string" ? Date.parse(value) : NaN;
    if (at !== null && Number.isFinite(at)) return at;
  }
  for (const key of ["resetIn", "reset_in", "ttl", "reset_after_seconds"]) {
    const seconds = numeric(detail[key]);
    if (seconds !== null && seconds > 0) return epoch(now + seconds * 1000, 1);
  }
  return null;
}

function window(kind: QuotaWindow["kind"], label: string, usedPercent: number, detail: ObjectValue, now: number): QuotaWindow {
  return { kind, label, remaining_percent: 100 - usedPercent, reset_at: resetAt(detail, now),
    used: numeric(detail.used ?? detail.currentValue), total: numeric(detail.limit ?? detail.usage) };
}

function usedPercent(detail: ObjectValue): number | null {
  const pct = percentage(detail.used_percent) ?? percentage(detail.percentage);
  if (pct !== null) return pct;
  const used = numeric(detail.used ?? detail.currentValue), total = numeric(detail.limit ?? detail.usage);
  if (total === null || total <= 0) return null;
  if (used !== null) return percentage(used / total * 100);
  const remaining = numeric(detail.remaining);
  return remaining === null ? null : percentage(100 - remaining / total * 100);
}

function parseOpenAI(data: ObjectValue, now: number) {
  const limits: QuotaWindow[] = [];
  const rate = object(data.rate_limit);
  for (const raw of [rate.primary_window, rate.secondary_window]) {
    const detail = object(raw), seconds = numeric(detail.limit_window_seconds), pct = percentage(detail.used_percent);
    const kind = seconds === 18000 ? "fiveHour" : seconds === 604800 ? "weekly" : seconds === 2628000 ? "monthly" : "period";
    if (pct === null || seconds === null || seconds <= 0) continue;
    const label = kind === "fiveHour" ? "5-hour" : kind === "weekly" ? "Weekly" : kind === "monthly" ? "Monthly" : `${Math.round(seconds / 3600)}-hour`;
    limits.push(window(kind, label, pct, detail, now));
  }
  const monthly = object(object(data.spend_control).individual_limit), remaining = percentage(monthly.remaining_percent);
  if (remaining !== null && !limits.some(w => w.kind === "monthly")) limits.push(window("monthly", "Monthly", 100 - remaining, monthly, now));
  const plan = text(data.plan_type);
  return { limits, plan: plan ? ({ plus: "ChatGPT Plus", pro: "ChatGPT Pro" }[plan] ?? plan) : null };
}

function parseZai(data: ObjectValue, now: number) {
  const root = object(data.data), raw = root.limits ?? data.limits, limits: QuotaWindow[] = [];
  if (data.success !== false && !(Number(data.code) >= 400) && Array.isArray(raw)) for (const value of raw) {
    const detail = object(value), unit = numeric(detail.unit), pct = percentage(detail.percentage);
    if (!["TOKENS_LIMIT", "CREDIT_LIMIT"].includes(String(detail.type)) || pct === null || (unit !== 3 && unit !== 6)) continue;
    const limit = window(unit === 3 ? "fiveHour" : "weekly", unit === 3 ? "5-hour" : "Weekly", pct, detail, now);
    limit.reset_at = epoch(detail.nextResetTime, 1);
    limits.push(limit);
  }
  return { limits, plan: text(root.level) };
}

function parseKimi(data: ObjectValue, now: number) {
  const root = data.data ? object(data.data) : data, limits: QuotaWindow[] = [];
  const weekly = object(root.usage), pct = usedPercent(weekly);
  if (pct !== null) limits.push(window("weekly", "Weekly", pct, weekly, now));
  if (Array.isArray(root.limits)) for (const raw of root.limits) {
    const item = object(raw), descriptor = object(item.window), detail = item.detail ? object(item.detail) : item;
    const duration = numeric(descriptor.duration ?? item.duration), unit = String(descriptor.timeUnit ?? item.timeUnit ?? "").toUpperCase();
    const fiveHour = (unit.includes("MINUTE") && duration === 300) || (unit.includes("HOUR") && duration === 5);
    const kind = fiveHour ? "fiveHour" : unit.includes("DAY") && duration === 7 ? "weekly" : "period";
    // Kimi's untouched 5h window is a descriptor without usage counters.
    const used = usedPercent(detail) ?? (fiveHour && Object.keys(detail).every(key => ["window", "resetTime", "reset_time", "resetAt", "reset_at"].includes(key)) ? 0 : null);
    if (used === null || (kind !== "period" && limits.some(w => w.kind === kind))) continue;
    const label = fiveHour ? "5-hour" : kind === "weekly" ? "Weekly" : duration ? `${duration} ${unit.includes("MINUTE") ? "min" : unit.includes("HOUR") ? "hours" : "days"}` : "Period";
    limits.push(window(kind, label, used, detail, now));
  }
  return { limits, plan: text(object(object(root.user).membership).level)?.replace(/^LEVEL_/, "") ?? null };
}

function parseClaude(data: ObjectValue, now: number): QuotaWindow[] {
  const limits: QuotaWindow[] = [];
  for (const [key, kind, label] of [["five_hour", "fiveHour", "5-hour"], ["seven_day", "weekly", "Weekly"]] as const) {
    const detail = object(data[key]), pct = percentage(detail.utilization);
    if (pct !== null) limits.push(window(kind, label, pct, { reset_at: detail.resets_at }, now));
  }
  return limits;
}

class QuotaError extends Error {
  constructor(readonly status: "sign_in_required" | "unavailable", message: string) { super(message); }
}

export class QuotaService {
  private readonly opencodeAuth: string;
  private readonly codexAuth: string;
  private readonly claudeAuth: string;
  private readonly claudeKeychain: () => Promise<string | null>;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly cache = new Map<QuotaProvider, { identity: string; value: ProviderQuota }>();
  private readonly pending = new Map<string, Promise<ProviderQuota>>();

  constructor(options: Options = {}) {
    this.opencodeAuth = options.opencodeAuth ?? join(dirname(getDbPath()), "auth.json");
    this.codexAuth = options.codexAuth ?? join(codexHome(), "auth.json");
    this.claudeAuth = options.claudeAuth ?? claudeCredentialLocation().path;
    this.claudeKeychain = options.claudeKeychain ?? (options.claudeAuth ? async () => null : readClaudeKeychain);
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async get(provider: QuotaProvider, refresh = false): Promise<ProviderQuota> {
    const empty: ProviderQuota = { provider, status: "not_configured", plan: null, limits: [], updated_at: null, message: null };
    const source = provider === "claude" ? "Claude Code" : provider === "codex" ? "Codex" : "OpenCode";
    let auth: ObjectValue;
    try {
      const keychain = provider === "claude" ? await this.claudeKeychain() : null;
      auth = object(JSON.parse(keychain ?? await readFile(provider === "claude" ? this.claudeAuth : provider === "codex" ? this.codexAuth : this.opencodeAuth, "utf8")));
    }
    catch (error) {
      this.cache.delete(provider);
      return { ...empty, status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "not_configured" : "unavailable",
        message: `Unable to read ${source} sign-in. Sign in with ${source} to connect this provider.` };
    }
    const credential = credentials(auth, provider);
    if (!credential) {
      this.cache.delete(provider);
      return { ...empty, message: provider === "claude" ? "Sign in with a Claude subscription in Claude Code. API keys do not expose subscription limits." : provider === "codex" || provider === "openai"
        ? `Sign in with ChatGPT in ${source}. API keys do not expose subscription limits.`
        : `Connect this provider in OpenCode to see its limits.` };
    }
    const identity = JSON.stringify(credential), cached = this.cache.get(provider);
    const previous = cached?.identity === identity ? cached.value : undefined;
    if (credential.expires !== null && credential.expires <= this.now()) return { ...empty, status: "sign_in_required", message: `Open ${source} to renew your sign-in, then refresh.` };
    const resetDue = previous?.limits.some(w => w.reset_at !== null && w.reset_at > (previous.updated_at ?? 0) && w.reset_at <= this.now());
    if (!refresh && previous?.status === "ready" && this.now() - previous.updated_at! < 60_000 && !resetDue) return previous;
    const key = `${provider}:${identity}`;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const promise = this.load(provider, credential, empty, previous).then(value => {
      this.cache.set(provider, { identity, value }); return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private async request(url: string, credential: Credential, authorization = `Bearer ${credential.token}`, extraHeaders: Record<string, string> = {}): Promise<ObjectValue> {
    const headers: Record<string, string> = { Authorization: authorization, Accept: "application/json", ...extraHeaders };
    if (credential.account) headers["ChatGPT-Account-Id"] = credential.account;
    // Never follow a redirect carrying the provider's authorization header.
    const response = await this.fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (response.status === 401 || response.status === 403) throw new QuotaError("sign_in_required", "Provider rejected the saved sign-in. Open the agent to sign in again, then refresh.");
    if (response.status === 429) throw new QuotaError("unavailable", "Provider is rate limiting requests. Try again shortly.");
    if (!response.ok) throw new QuotaError("unavailable", `Provider is temporarily unavailable (HTTP ${response.status}).`);
    // Upstream bodies and errors may contain secrets; only fixed messages leave this service.
    return object(await response.json());
  }

  private async load(provider: QuotaProvider, credential: Credential, empty: ProviderQuota, previous?: ProviderQuota): Promise<ProviderQuota> {
    try {
      let parsed: { limits: QuotaWindow[]; plan: string | null };
      if (provider === "openai" || provider === "codex") parsed = parseOpenAI(await this.request(OPENAI_URL, credential), this.now());
      else if (provider === "claude") parsed = { limits: parseClaude(await this.request(CLAUDE_URL, credential, undefined, { "anthropic-beta": "oauth-2025-04-20" }), this.now()), plan: credential.plan ?? null };
      else if (provider === "kimi") parsed = parseKimi(await this.request(KIMI_URL, credential), this.now());
      else {
        let lastError: unknown;
        parsed = { limits: [], plan: null };
        for (const [url, prefix] of [[ZAI_URL, "Bearer "], [`${ZAI_URL}/quota/limit`, "Bearer "], [`${ZAI_URL}/quota/limit`, ""], [ZAI_URL, ""]]) {
          try {
            parsed = parseZai(await this.request(url, credential, `${prefix}${credential.token}`), this.now());
            if (parsed.limits.length) break;
          } catch (error) { lastError = error; }
        }
        if (!parsed.limits.length && lastError) throw lastError;
      }
      if (!parsed.limits.length) throw new QuotaError("unavailable", "Provider did not return any recognized usage limits.");
      const order = { fiveHour: 0, weekly: 1, monthly: 2, period: 3 };
      parsed.limits.sort((a, b) => order[a.kind] - order[b.kind]);
      return { ...empty, ...parsed, status: "ready", updated_at: this.now() };
    } catch (error) {
      const message = error instanceof QuotaError ? error.message : "Unable to reach the provider or read its limits. Try again shortly.";
      if (previous?.limits.length) return { ...previous, status: "stale", message };
      return { ...empty, status: error instanceof QuotaError ? error.status : "unavailable", message };
    }
  }
}

export function registerQuotaRoutes(app: Hono, service: QuotaService): void {
  app.get("/api/quota/:provider", async c => {
    c.header("Cache-Control", "no-store");
    const provider = c.req.param("provider");
    if (!(QUOTA_PROVIDERS as readonly string[]).includes(provider)) return c.json({ error: "Unknown quota provider" }, 400);
    return c.json(await service.get(provider as QuotaProvider, c.req.query("refresh") === "1"));
  });
}
