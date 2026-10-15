import { useMemo, useState } from "react";
import { CalendarDays, Download, MousePointer2 } from "lucide-react";
import type { StatsDashboardPayload, StatsTokenBucket } from "@shared/usage";
import { activitySummary, calendarMonths, dailyCSV, type ActivityMode, type TokenMetric } from "./activity";
import { count, tokens, TOKEN_PARTS } from "./format";
import { exportStatisticsCSV } from "../nativeBridge";

export const TOKEN_METRICS = [{ key: "total" as const, label: "Total tokens" }, ...TOKEN_PARTS];
type Props = { activity: StatsDashboardPayload["token_activity"]; timezone: string; now: number;
  mode: ActivityMode; metric: TokenMetric; onMode: (mode: ActivityMode) => void; onMetric: (metric: TokenMetric) => void;
  onRange: (from: number, to: number) => void };

export function TokenActivity({ activity, timezone, now, onRange, mode, metric, onMode, onMetric }: Props) {
  const [focused, setFocused] = useState<StatsTokenBucket | null>(null);
  const rows = activity[mode];
  const summary = useMemo(() => activitySummary(rows, metric, now), [rows, metric, now]);
  const months = useMemo(() => calendarMonths(activity.daily), [activity.daily]);
  const max = summary.peak?.tokens[metric] ?? 0;
  const metricLabel = TOKEN_METRICS.find(part => part.key === metric)!.label;
  const period = mode === "daily" ? "day" : "week";
  const active = focused && rows.includes(focused) ? focused : summary.peak;
  const dates = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
  const rangeLabel = (row: StatsTokenBucket) => mode === "daily" ? dates.format(row.from) : dates.formatRange(row.from, row.to - 1);
  function hint(row: StatsTokenBucket) {
    return `${rangeLabel(row)}: ${count(row.tokens[metric])} ${metricLabel.toLowerCase()}; ${count(row.calls)} calls${row.tokens[metric] === 0 ? "; No recorded tokens" : ""}${row.partial ? "; Partial period" : ""}${row.incomplete ? "; Incomplete usage data" : ""}. Select this period.`;
  }
  function cell(row: StatsTokenBucket, label: string) {
    const future = row.from >= now;
    const level = row.tokens[metric] > 0 && max > 0 ? Math.min(4, Math.ceil(row.tokens[metric] / max * 4)) : 0;
    return <button type="button" key={row.key} className="stats-token-cell" data-level={level} data-partial={row.partial || undefined}
      data-date={row.key} data-value={row.tokens[metric]} disabled={future} aria-label={future ? `${label}: Future period` : hint(row)} title={future ? "Future period" : hint(row)}
      onMouseEnter={() => setFocused(row)} onMouseLeave={() => setFocused(null)} onFocus={() => setFocused(row)} onBlur={() => setFocused(null)} onClick={() => onRange(row.from, row.to)}>
      <span>{label}</span>{mode === "weekly" && <strong>{tokens(row.tokens[metric])}</strong>}{row.partial && <i aria-hidden="true" />}
    </button>;
  }
  function download() {
    const content = dailyCSV(activity.daily, timezone);
    const filename = `kliprun-tokens-${activity.daily[0]?.key ?? "empty"}-${activity.daily.at(-1)?.key ?? "period"}.csv`;
    if (exportStatisticsCSV(filename, content)) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section id="stats-token-activity" className="stats-section stats-panel stats-token-activity" aria-label="Token activity">
    <div className="stats-section-title"><div><h2><CalendarDays size={18} />Token activity</h2><p>See busy periods, compare daily habits, and explore a spike.</p></div>
      <div className="stats-activity-controls"><select className="stats-select" aria-label="Heatmap token type" value={metric} onChange={event => { setFocused(null); onMetric(event.target.value as TokenMetric); }}>
        {TOKEN_METRICS.map(part => <option key={part.key} value={part.key}>{part.label}</option>)}</select>
        <div className="stats-tablist" role="group" aria-label="Heatmap period">{(["daily", "weekly"] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? "stats-tab-active" : ""} onClick={() => { setFocused(null); onMode(value); }}>{value === "daily" ? "Daily" : "Weekly"}</button>)}</div>
      </div>
    </div>
    <div className="stats-activity-metrics">
      <div><span>Dated {metricLabel.toLowerCase()}</span><strong>{tokens(summary.total)}</strong></div>
      <div><span>{mode === "daily" ? "Days" : "Weeks"} with usage</span><strong>{summary.active}<small> / {summary.periods}</small></strong></div>
      <div><span>Average / {period}</span><strong title={count(summary.average)}>{tokens(summary.average)}</strong></div>
      <div><span>Peak {period}</span><strong>{summary.peak ? tokens(max) : "—"}</strong><small>{summary.peak ? rangeLabel(summary.peak) : "No recorded tokens"}</small></div>
    </div>
    {rows.length === 0 ? <div className="stats-table-empty">No dated token usage in this period. Try another date range.</div> : mode === "daily" ? <div className="stats-token-months">
      {months.map(month => <div className="stats-token-month" key={month.key}><h3>{month.label}</h3><div className="stats-token-calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span className="stats-token-weekday" key={day}>{day}</span>)}
        {Array.from({ length: month.offset }, (_, i) => <span key={`blank-${i}`} />)}
        {month.days.map((row, i) => row ? cell(row, String(i + 1)) : <span key={`outside-${i}`} className="stats-token-outside" title="Outside selected period">{i + 1}</span>)}
      </div></div>)}
    </div> : <div className="stats-token-weeks">{rows.map(row => cell(row, rangeLabel(row)))}</div>}
    <div className="stats-activity-readout" aria-live="polite"><MousePointer2 size={14} /><span>{active ? <><b>{rangeLabel(active)}</b> · {count(active.tokens[metric])} {metricLabel.toLowerCase()} · {count(active.calls)} calls{active.partial && " · Partial period"}{active.incomplete && " · Incomplete usage data"}</> : "Hover or focus a cell for exact usage. Click to filter the dashboard."}</span></div>
    <div className="stats-activity-footer"><div className="stats-activity-legend"><span>No usage</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>{max ? `${tokens(max)} peak` : "More"}</span><span className="stats-activity-partial"><i />Partial period</span></div>
      <button type="button" className="stats-button" onClick={download} disabled={!activity.daily.length}><Download size={13} />Export daily CSV</button></div>
    <p className="stats-activity-note">{timezone} · Weeks start on Monday. Colors scale to the busiest {period} for this token type. Averages include zero-usage periods and the current partial period. Empty cells mean no recorded usage.</p>
  </section>;
}
