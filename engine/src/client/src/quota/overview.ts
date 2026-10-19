import { QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider } from "@shared/quota";
import type { StatsDashboardPayload, StatsFilters } from "@shared/usage";
import { parseFilters, serializeFilters } from "../statistics/filters";
import { tone } from "./format";

export type UsagePeriod = "today" | "7" | "30" | "all";
export const USAGE_PERIODS: Array<{ key: UsagePeriod; label: string }> = [{ key: "today", label: "Today" }, { key: "7", label: "Last 7 days" }, { key: "30", label: "Last 30 days" }, { key: "all", label: "All time" }];

export function providerView(quota: ProviderQuota | undefined, error: string | undefined, pending: boolean, now: number) {
  const value = quota?.limits.length ? Math.min(...quota.limits.map(limit => limit.remaining_percent)) : null;
  const cached = quota?.status === "stale" || Boolean(error && value !== null);
  const due = quota?.limits.some(limit => limit.reset_at !== null && limit.reset_at <= now) ?? false;
  const live = quota?.status === "ready" && !error && !due && value !== null;
  const status = cached ? "Cached" : due ? "Reset pending" : live ? value === 0 ? "Limit reached" : value <= 30 ? "Running low" : "Available"
    : quota?.status === "not_configured" ? "Not connected" : quota?.status === "sign_in_required" ? "Sign in required" : pending && !quota ? "Connecting" : "Unavailable";
  return { value, cached, due, live, status, tone: live ? tone(value) : "unknown", limiting: quota?.limits.find(limit => limit.remaining_percent === value) };
}

export function quotaOverview(quotas: Partial<Record<QuotaProvider, ProviderQuota>>, errors: Partial<Record<QuotaProvider, string>>, now: number, providers: readonly QuotaProvider[] = QUOTA_PROVIDERS) {
  const views = providers.map(provider => ({ provider, ...providerView(quotas[provider], errors[provider], false, now) }));
  const resets = views.filter(view => view.live).flatMap(view => quotas[view.provider]!.limits
    .filter(limit => limit.reset_at !== null && limit.reset_at > now)
    .map(limit => ({ provider: view.provider, label: limit.label, at: limit.reset_at!, remaining: limit.remaining_percent }))).sort((a, b) => a.at - b.at);
  return { available: views.filter(view => view.live && view.value! > 0).length, current: views.filter(view => view.live).length,
    attention: views.filter(view => view.live && view.value! <= 30 || view.status === "Sign in required"), resets };
}

export function usageFilters(period: UsagePeriod, source: string, now: number, timezone?: string): StatsFilters {
  const query = new URLSearchParams({ period });
  if (source) query.set("source", source);
  if (timezone) query.set("timezone", timezone);
  return { ...parseFilters(`?${query}`, now), period };
}

export function statisticsHref(filters: StatsFilters, patch: Partial<StatsFilters> = {}, tokenType?: string): string {
  const query = serializeFilters({ ...filters, ...patch });
  query.set("period", patch.from !== undefined || patch.to !== undefined ? "custom" : filters.period ?? "custom");
  if (tokenType) query.set("tokenType", tokenType);
  return `/stats?${query}`;
}
export function navigateStatistics(href: string) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function hasTokenCoverage(data: StatsDashboardPayload): boolean {
  return data.summary.calls > 0 || data.summary.tokens.total > 0 || data.sources.some(source =>
    (!data.filters.sources.length || data.filters.sources.includes(source.source)) && source.state === "ready");
}
