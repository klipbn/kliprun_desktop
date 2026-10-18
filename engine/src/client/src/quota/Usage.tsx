import { AlertTriangle, ArrowUpRight, Gauge, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { QUOTA_LABELS, QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider, type QuotaWindow } from "@shared/quota";
import { tone, percent, countdown, date } from "./format";
import "./usage.css";

type Quotas = Partial<Record<QuotaProvider, ProviderQuota>>;
type Errors = Partial<Record<QuotaProvider, string>>;
type Props = { quotas: Quotas; pending: QuotaProvider[]; errors: Errors; now: number; onRefresh: () => void };
const SOURCE = { openai: "OpenCode", codex: "Codex", claude: "Claude Code", zai: "OpenCode", kimi: "OpenCode" };

function remaining(quota: ProviderQuota): number | null {
  return quota.limits.length ? Math.min(...quota.limits.map(w => w.remaining_percent)) : null;
}
function resetDue(quota: ProviderQuota, now: number): boolean {
  return quota.limits.some(w => w.reset_at !== null && w.reset_at <= now);
}
function updated(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  return minutes < 1 ? "Updated just now" : minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${Math.floor(minutes / 60)}h ago`;
}

function LimitRow({ limit, now }: { limit: QuotaWindow; now: number }) {
  const due = limit.reset_at !== null && limit.reset_at <= now;
  return <div className="usage-limit" data-tone={tone(limit.remaining_percent)}>
    <div className="usage-limit-heading"><span>{limit.label}</span><strong>{percent(limit.remaining_percent)}% <small>left</small></strong></div>
    <div className="usage-meter" role="meter" aria-label={`${limit.label}: ${percent(limit.remaining_percent)}% remaining`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={limit.remaining_percent}>
      <span style={{ width: `${limit.remaining_percent}%` }} />
    </div>
    <div className="usage-limit-caption">
      <span title={limit.reset_at === null ? undefined : date(limit.reset_at)}>{due ? "Reset pending" : limit.reset_at !== null ? `Resets in ${countdown(limit.reset_at, now)}` : "Reset time unavailable"}</span>
      {limit.used !== null && limit.total !== null && <span>{new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(limit.used)} / {new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(limit.total)} used</span>}
    </div>
  </div>;
}

function ProviderCard({ provider, quota, pending, error, now }: { provider: QuotaProvider; quota?: ProviderQuota; pending: boolean; error?: string; now: number }) {
  const value = quota ? remaining(quota) : null;
  const cached = quota?.status === "stale" || (Boolean(error) && value !== null);
  const due = quota ? resetDue(quota, now) : false;
  const live = quota?.status === "ready" && !error && !due;
  const limiting = quota?.limits.find(w => w.remaining_percent === value);
  const status = cached ? "Cached" : due ? "Reset pending" : live ? value === 0 ? "Limit reached" : value !== null && value <= 30 ? "Running low" : "Available"
    : quota?.status === "not_configured" ? "Not connected" : quota?.status === "sign_in_required" ? "Sign in required" : pending && !quota ? "Connecting" : "Unavailable";
  return <article className="usage-provider" data-provider={provider} data-tone={live || cached ? tone(value) : "unknown"} aria-label={QUOTA_LABELS[provider]} title={`${status} · Via ${SOURCE[provider]} · ${quota?.updated_at != null ? updated(quota.updated_at, now) : "No usage data yet"}`}>
    <header className="usage-provider-header">
      <div className="usage-provider-identity"><span className="usage-provider-indicator" data-tone={live ? tone(value) : "unknown"} role="img" aria-label={`${status}${value !== null ? `: ${percent(value)}% remaining` : ""}`} title={`${status}${value !== null ? `: ${percent(value)}% remaining` : ""}`} /><h2>{QUOTA_LABELS[provider]}</h2></div>
    </header>
    {value !== null && quota ? <>
      <div className="usage-balance" aria-label={`${QUOTA_LABELS[provider]}: ${percent(value)}% remaining`}>
        <div><strong>{percent(value)}<span>%</span></strong><span className="usage-balance-label">remaining</span></div>
        <div className="usage-limiting"><span>Most limited window</span><b>{limiting?.label}</b><small>{cached ? "Last known balance" : due ? "Waiting for fresh limits" : value === 0 ? "This window must reset to continue" : "Your lowest remaining allowance"}</small></div>
      </div>
      <div className="usage-limits">{quota.limits.map((limit, i) => <LimitRow key={`${limit.kind}-${i}`} limit={limit} now={now} />)}</div>
    </> : pending && !quota && !error ? <div className="usage-card-loading" role="status"><span className="usage-skeleton usage-skeleton-number" /><span className="usage-skeleton" /><span className="usage-skeleton" /><p>Checking your subscription…</p></div>
      : <div className="usage-card-empty"><Unplug size={25} /><strong>Usage unknown</strong><p>{error ?? quota?.message ?? `Connect this provider in ${SOURCE[provider]} to see its remaining limits.`}</p></div>}
    {value !== null && (error || quota?.message) && <p className="usage-provider-notice" role="status"><AlertTriangle size={13} />{error ?? quota?.message}</p>}
    <footer className="usage-provider-footer"><span>Via {SOURCE[provider]}</span><span>{quota?.updated_at !== null && quota?.updated_at !== undefined ? updated(quota.updated_at, now) : "No usage data yet"}</span></footer>
  </article>;
}

export function UsageDashboard({ quotas, pending, errors, now, onRefresh }: Props) {
  const connected = QUOTA_PROVIDERS.filter(id => quotas[id]?.status === "ready" && !errors[id] && !resetDue(quotas[id]!, now));
  const resets = connected.flatMap(provider => quotas[provider]!.limits
    .filter(w => w.reset_at !== null && w.reset_at > now)
    .map(w => ({ provider, window: w.label, at: w.reset_at! }))).sort((a, b) => a.at - b.at);
  const checking = pending.length > 0;
  return <main className="usage-screen" data-testid="usage-screen">
    <div className="usage-container">
      <div className="usage-heading"><div><div className="usage-eyebrow"><Gauge size={14} />Subscription limits</div><h1>Usage</h1><p>Your subscriptions, at a glance. Know what is left and when it resets.</p></div>
        <div className="usage-refresh"><span>{checking ? "Checking providers…" : "Auto-refreshes every minute"}</span><button type="button" onClick={onRefresh} disabled={checking}><RefreshCw size={15} className={checking ? "animate-spin" : ""} />Refresh</button></div>
      </div>
      <div className="usage-section-heading"><h2>Provider balances</h2><span>Each percentage shows the allowance remaining</span></div>
      <section className="usage-provider-grid" aria-label="Provider balances">
        {QUOTA_PROVIDERS.map(provider => <ProviderCard key={provider} provider={provider} quota={quotas[provider]} pending={pending.includes(provider)} error={errors[provider]} now={now} />)}
      </section>
      <details className="usage-reset-panel"><summary className="usage-reset-summary">Reset schedule and provider information</summary>
        {resets.length ? <div className="usage-reset-list">{resets.slice(0, 4).map((reset, index) => <div className="usage-reset-item" key={`${reset.provider}-${index}`}>
          <span className="usage-reset-dot" data-provider={reset.provider} /><div><strong>{QUOTA_LABELS[reset.provider]}</strong><span>{reset.window}</span></div><time dateTime={new Date(reset.at).toISOString()}>{date(reset.at)}</time><b>in {countdown(reset.at, now)}</b>
        </div>)}</div> : <p className="usage-reset-empty">Reset times will appear when a provider returns current limits.</p>}
      <div className="usage-footnote"><ShieldCheck size={15} /><p>Limits come directly from your providers using your existing agent sign-ins. Cached balances are marked. OpenCode and Codex can use different OpenAI accounts.</p><a href="/stats" onClick={event => { event.preventDefault(); window.history.pushState(null, "", "/stats"); window.dispatchEvent(new PopStateEvent("popstate")); }}>View usage history<ArrowUpRight size={13} /></a></div>
      </details>
    </div>
  </main>;
}

export default UsageDashboard;
