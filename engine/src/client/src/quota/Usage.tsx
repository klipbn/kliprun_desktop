import { useCallback, useState } from "react";
import { AlertTriangle, ArrowUpRight, Clock3, Gauge, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { QUOTA_LABELS, QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider, type QuotaWindow } from "@shared/quota";
import { TaskDetail } from "../statistics/TaskDetail";
import { count, sourceName } from "../statistics/format";
import type { TokenMetric } from "../statistics/activity";
import { tone, percent, countdown, date, retryHint } from "./format";
import { hasTokenCoverage, navigateStatistics, providerView, quotaOverview, statisticsHref, USAGE_PERIODS } from "./overview";
import { useUsageHistory } from "./useUsageHistory";
import { HistoryCoverage, TokenBreakdowns, TokenComposition, TokenSessions, TokenSummary, TokenTrend } from "./TokenPanels";
import "../statistics/statistics.css";
import "./usage.css";
import { hasDesktopBridge, notifyNativeAction } from '../nativeBridge';

type Quotas = Partial<Record<QuotaProvider, ProviderQuota>>;
type Errors = Partial<Record<QuotaProvider, string>>;
type Props = { quotas: Quotas; pending: QuotaProvider[]; errors: Errors; now: number; onRefresh: () => void; activeSessionIds?: Set<string>; onBoard?: (id: string) => void; providers?: readonly QuotaProvider[] };
const SOURCE = { openai: "OpenCode", codex: "Codex", claude: "Claude Code", zai: "OpenCode", kimi: "OpenCode" };
const EMPTY_SESSIONS = new Set<string>();
function updated(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  return minutes < 1 ? "Updated just now" : minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${Math.floor(minutes / 60)}h ago`;
}
function jumpTo(id: string) { document.getElementById(id)?.scrollIntoView({ block: "start" }); }

function LimitRow({ limit, now }: { limit: QuotaWindow; now: number }) {
  const due = limit.reset_at !== null && limit.reset_at <= now;
  return <div className="usage-limit" data-tone={tone(limit.remaining_percent)}>
    <div className="usage-limit-heading"><span>{limit.label}</span><strong>{percent(limit.remaining_percent)}% <small>left</small></strong></div>
    <div className="usage-meter" role="meter" aria-label={`${limit.label}: ${percent(limit.remaining_percent)}% remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={limit.remaining_percent}><span style={{ width: `${limit.remaining_percent}%` }} /></div>
    <div className="usage-limit-caption"><span title={limit.reset_at === null ? undefined : date(limit.reset_at)}>{due ? "Reset pending" : limit.reset_at !== null ? `Resets in ${countdown(limit.reset_at, now)}` : "Reset time unavailable"}</span>
      {limit.used !== null && limit.total !== null && <span title={`${count(limit.used)} / ${count(limit.total)} used`}>{new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(limit.used)} / {new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(limit.total)} used</span>}
    </div>
  </div>;
}

function ProviderCard({ provider, quota, pending, error, now }: { provider: QuotaProvider; quota?: ProviderQuota; pending: boolean; error?: string; now: number }) {
  const view = providerView(quota, error, pending, now), { value, status, cached, due, live, limiting } = view;
  return <article className="usage-provider" data-provider={provider} data-tone={view.tone} data-current={live} aria-label={QUOTA_LABELS[provider]}>
    <header className="usage-provider-header"><div className="usage-provider-identity"><span className="usage-provider-indicator" role="img" aria-label={`${status}${value !== null ? `: ${percent(value)}% remaining` : ""}`} /><h2>{QUOTA_LABELS[provider]}</h2></div>
      <span className="usage-provider-status">{status}</span></header>
    {quota?.plan && <div className="usage-provider-plan">{quota.plan}</div>}
    {value !== null && quota ? <>
      <div className="usage-balance" aria-label={`${QUOTA_LABELS[provider]}: ${percent(value)}% remaining`}><strong>{percent(value)}<span>%</span></strong><div><span>{cached ? "last known remaining" : due ? "awaiting reset update" : "remaining"}</span><small>Most limited: {limiting?.label}</small></div></div>
      <div className="usage-limits">{quota.limits.map((limit, index) => <LimitRow key={`${limit.kind}-${index}`} limit={limit} now={now} />)}</div>
    </> : pending && !quota && !error ? <div className="usage-card-loading" role="status"><span className="usage-skeleton" /><span className="usage-skeleton" /><p>Checking your subscription…</p></div>
      : <div className="usage-card-empty"><Unplug size={19} /><strong>Usage unknown</strong><p>{error ?? quota?.message ?? (quota?.status === "ready" ? "No limit windows returned" : `Connect this provider in ${SOURCE[provider]} to see its remaining limits.`)}</p></div>}
    {value !== null && (error || quota?.message) && <p className="usage-provider-notice" role="status"><AlertTriangle size={13} />{error ?? quota?.message}</p>}
    <footer className="usage-provider-footer"><span>Via {SOURCE[provider]}</span><span>{quota?.updated_at != null ? updated(quota.updated_at, now) : "No usage data yet"}</span>
      {quota?.retry_at != null && <span className="usage-provider-retry" title={`Checks may resume after ${date(quota.retry_at)}`}>{retryHint(quota.retry_at, now)}</span>}
    </footer>
  </article>;
}

export function UsageDashboard({ quotas, pending, errors, now, onRefresh, activeSessionIds = EMPTY_SESSIONS, onBoard, providers = QUOTA_PROVIDERS }: Props) {
  const [refresh, setRefresh] = useState(0), [metric, setMetric] = useState<TokenMetric>("total");
  const [selectedId, setSelectedId] = useState<string | null>(null), [resetsOpen, setResetsOpen] = useState(false);
  const history = useUsageHistory(now, refresh), data = history.dashboard.data;
  const overview = quotaOverview(quotas, errors, now, providers), nextReset = overview.resets[0];
  const checking = pending.some(id => providers.includes(id)), statsHref = statisticsHref(history.filters);
  const cadence = !providers.length ? 'Checks disabled' : providers.includes('claude') ? providers.length === 1 ? 'Claude: 5 min' : 'Claude: 5 min · other providers: 1 min' : 'Checks every minute';
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const retryHistory = () => setRefresh(value => value + 1);
  function refreshAll() { onRefresh(); retryHistory(); }
  return <><main className="usage-screen" data-testid="usage-screen">
    <div className="usage-container">
      <header className="usage-heading"><div><div className="usage-eyebrow"><Gauge size={14} />Capacity & consumption</div><h1>Usage</h1><p>Understand your token usage and remaining subscription limits.</p></div>
        <div className="usage-heading-actions"><a className="usage-button" href={statsHref} onClick={event => { event.preventDefault(); navigateStatistics(statsHref); }}>Explore Statistics<ArrowUpRight size={14} /></a><button className="usage-button" type="button" onClick={refreshAll} disabled={checking}><RefreshCw size={14} className={checking ? "animate-spin" : ""} />Refresh</button></div>
      </header>
      <nav className="usage-section-nav" aria-label="Usage sections">{[["usage-overview", "Overview"], ["usage-limits", "Subscription limits"], ["usage-token-activity", "Token activity"], ["usage-breakdowns", "Breakdowns"], ["usage-sessions", "Tasks"]].map(([id, label]) => <button type="button" key={id} onClick={() => jumpTo(id)}>{label}</button>)}</nav>
      <section id="usage-overview" className="usage-overview">
        <div className="usage-history-toolbar"><div className="usage-periods" role="group" aria-label="Token usage period">{USAGE_PERIODS.map(period => <button type="button" key={period.key} aria-pressed={history.period === period.key} onClick={() => history.setPeriod(period.key)}>{period.label}</button>)}</div>
          <label className="usage-source-filter"><span>Token history</span><select aria-label="Token history source" value={history.source} onChange={event => history.setSource(event.target.value)}><option value="">All agents</option>{["opencode", "codex", "claude"].map(source => <option value={source} key={source}>{sourceName(source)}</option>)}</select></label>
        </div>
        {history.dashboard.error && <div className="usage-warning" role="alert"><AlertTriangle size={16} /><span>{history.dashboard.error}</span><button type="button" className="usage-button" onClick={retryHistory} aria-label="Retry token history">Retry</button></div>}
        {data ? <TokenSummary data={data} period={history.period} /> : !history.dashboard.error && <div className="usage-token-summary" role="status" aria-label="Loading token history">{["Recorded tokens", "Model calls", "Input served from cache", "Tokens per call"].map(label => <article className="usage-kpi" key={label}><span>{label}</span><span className="usage-skeleton" /><small>Loading local history…</small></article>)}</div>}
        <div className="usage-history-status"><span>{history.dashboard.pending ? "Updating token history…" : data ? `Recorded history · ${data.filters.timezone} · ${updated(data.generated_at, now)}` : "Token history is independent of subscription limits"}</span>{data?.summary.incomplete && <button type="button" onClick={() => jumpTo("usage-data-coverage")} className="usage-partial">Partial coverage</button>}</div>
      </section>
      <section id="usage-limits" className="usage-section">
        <div className="usage-section-heading"><div><h2>Subscription limits</h2><p>Live provider allowances · independent of the selected token period</p></div><span>{checking ? "Checking providers…" : cadence}</span></div>
        {providers.length > 0 && <div className="usage-health" aria-label="Subscription overview"><div><ShieldCheck size={16} /><span><strong>{overview.current ? overview.available : "—"}<small> / {providers.length}</small></strong><span>Connections with capacity</span></span><small>{overview.current} current reports</small></div>
          <div data-attention={overview.attention.length > 0}><AlertTriangle size={16} /><span><strong>{overview.attention.length || (overview.current ? 0 : "—")}</strong><span>Need attention</span></span><small>{overview.attention.length ? overview.attention.map(item => QUOTA_LABELS[item.provider]).join(", ") : "No current limit alerts"}</small></div>
          <button type="button" onClick={() => { setResetsOpen(true); jumpTo("usage-resets"); }} disabled={!nextReset}><Clock3 size={16} /><span><strong>{nextReset ? countdown(nextReset.at, now) : "—"}</strong><span>Next window reset</span></span><small>{nextReset ? `${QUOTA_LABELS[nextReset.provider]} · ${nextReset.label}` : "No confirmed reset time"}</small></button>
        </div>}
        {providers.length ? <div className="usage-provider-grid" data-count={providers.length} aria-label="Provider balances">{providers.map(provider => <ProviderCard key={provider} provider={provider} quota={quotas[provider]} pending={pending.includes(provider)} error={errors[provider]} now={now} />)}</div>
          : <div className="usage-history-empty"><strong>No providers selected</strong><p>Choose subscription providers in Settings → Usage. Token history is still available below.</p>{typeof window !== 'undefined' && hasDesktopBridge() && <button className="usage-button" onClick={()=>notifyNativeAction('settings')}>Open Settings</button>}</div>}
      </section>
      {data && hasTokenCoverage(data) && <>
        <div id="usage-token-activity" className="usage-analysis-grid"><TokenTrend data={data} period={history.period} metric={metric} onMetric={setMetric} /><TokenComposition data={data} metric={metric} onMetric={setMetric} /></div>
        <TokenBreakdowns data={data} />
      </>}
      {data && !hasTokenCoverage(data) && <section id="usage-token-activity" className="usage-panel usage-history-empty"><h2>Token activity</h2><p>No indexed token history is available for this selection. Check data coverage below or choose another agent.</p></section>}
      <TokenSessions data={history.ranking.data} pending={history.ranking.pending} error={history.ranking.error} onSelect={setSelectedId} />
      <details id="usage-resets" className="usage-reset-panel" open={resetsOpen} onToggle={event => { if (event.currentTarget.open !== resetsOpen) setResetsOpen(event.currentTarget.open); }}><summary>Reset schedule <span>{overview.resets.length} upcoming windows</span></summary>
        {overview.resets.length ? <div className="usage-reset-list">{overview.resets.map((reset, index) => <div className="usage-reset-item" key={`${reset.provider}-${index}`}><i data-provider={reset.provider} /><div><strong>{QUOTA_LABELS[reset.provider]}</strong><span>{reset.label} · {percent(reset.remaining)}% left</span></div><time dateTime={new Date(reset.at).toISOString()}>{date(reset.at)}</time><b>in {countdown(reset.at, now)}</b></div>)}</div> : <p className="usage-note">Reset times appear when a provider returns current limits.</p>}
      </details>
      <div id="usage-data-coverage">{data && <HistoryCoverage data={data} />}</div>
      <footer className="usage-footnote"><ShieldCheck size={15} /><p>Read-only local history and provider limits. Existing agent sign-ins are used for subscription checks; OpenCode and Codex may use different OpenAI accounts. Cached and expired reports stay marked.</p></footer>
    </div>
  </main>{selectedId && <TaskDetail id={selectedId} filters={history.filters} refresh={refresh} activeSessionIds={activeSessionIds} onClose={closeDetail} onBoard={onBoard ?? (() => {})} />}</>;
}

export default UsageDashboard;
