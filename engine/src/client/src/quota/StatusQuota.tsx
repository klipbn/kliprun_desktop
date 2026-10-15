import { QUOTA_LABELS, QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider } from "@shared/quota";
import { countdown, date, percent, tone } from "./format";
import "./status-quota.css";

type Props = {
  quotas: Partial<Record<QuotaProvider, ProviderQuota>>;
  errors: Partial<Record<QuotaProvider, string>>;
  pending: QuotaProvider[];
  now: number;
  onOpen: () => void;
};

const labels = { openai: "OpenAI OC", codex: "Codex", zai: "Z.ai", kimi: "Kimi" };
const order = { fiveHour: 0, weekly: 1, monthly: 2, period: 3 };
const windows = { fiveHour: "5h", weekly: "7d", monthly: "Month", period: "Period" };

export function StatusQuota({ quotas, errors, pending, now, onOpen }: Props) {
  const providers = QUOTA_PROVIDERS.filter(id => quotas[id] && quotas[id]!.status !== "not_configured");
  if (!providers.length) return <button type="button" className="status-quota-empty" onClick={onOpen}>
    {pending.length ? "Checking limits…" : "Usage"}
  </button>;
  return <div className="status-quotas" aria-label="Subscription limits remaining">
    {providers.slice(0, 6).map(provider => {
      const quota = quotas[provider]!;
      const cached = quota.status === "stale" || Boolean(errors[provider]);
      const due = quota.limits.some(limit => limit.reset_at !== null && limit.reset_at <= now);
      const live = quota.status === "ready" && !cached && !due;
      const status = cached ? "Cached" : due ? "Reset pending" : quota.status === "sign_in_required" ? "Sign in required" : !live ? "Unavailable" : "";
      const limits = [...quota.limits].sort((a, b) => order[a.kind] - order[b.kind]);
      const details = [QUOTA_LABELS[provider], status, ...limits.map(limit => `${limit.label}: ${percent(limit.remaining_percent)}% remaining · ${limit.reset_at === null ? "Reset time unavailable" : limit.reset_at <= now ? "Reset pending" : `Resets in ${countdown(limit.reset_at, now)} (${date(limit.reset_at)})`}`), errors[provider] ?? quota.message].filter(Boolean).join("\n");
      return <button type="button" key={provider} className="status-quota" title={details}
        aria-label={`${QUOTA_LABELS[provider]}${status ? ` · ${status}` : ""}. Open Usage`} onClick={onOpen}>
        <span className="status-quota-name">{labels[provider]}{status && <small>{status}</small>}</span>
        <span className="status-quota-limits">
          {limits.length ? limits.map((limit, index) => <span className="status-quota-window" key={`${limit.kind}-${index}`} data-tone={live ? tone(limit.remaining_percent) : "unknown"}>
            <span className="status-quota-period">{windows[limit.kind]}</span>
            <span className="status-quota-track" role="meter" aria-label={`${QUOTA_LABELS[provider]} ${limit.label}: ${percent(limit.remaining_percent)}% remaining`}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={limit.remaining_percent}>
              <span style={{ width: `${limit.remaining_percent}%` }} />
            </span>
            <span className="status-quota-percent">{percent(limit.remaining_percent)}%</span>
          </span>) : <span className="status-quota-unknown">—</span>}
        </span>
      </button>;
    })}
    {providers.length > 6 && <button type="button" className="status-quota-empty" onClick={onOpen} aria-label={`${providers.length - 6} more providers. Open Usage`}>+{providers.length - 6}</button>}
  </div>;
}
