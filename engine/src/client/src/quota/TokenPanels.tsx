import { useState } from "react";
import { ArrowUpRight, BarChart3, Boxes, Cpu, Database, Folder, Layers3 } from "lucide-react";
import type { StatsBreakdown, StatsDashboardPayload, StatsFilters, StatsSessionsPayload } from "@shared/usage";
import { activitySummary, type TokenMetric } from "../statistics/activity";
import { cacheShare, compare, count, dateLabel, duration, percent, projectName, readable, sourceColor, sourceName, tokens, TOKEN_PARTS } from "../statistics/format";
import { hasTokenCoverage, navigateStatistics, statisticsHref, type UsagePeriod } from "./overview";

export function TokenSummary({ data, period }: { data: StatsDashboardPayload; period: UsagePeriod }) {
  const current = data.summary, previous = data.previous, available = hasTokenCoverage(data);
  const cards = [
    { label: "Recorded tokens", value: tokens(current.tokens.total), exact: count(current.tokens.total), icon: Cpu, note: period === "all" ? "Across indexed history" : compare(current.tokens.total, previous.tokens.total), id: "usage-total-tokens" },
    { label: "Model calls", value: count(current.calls), exact: count(current.calls), icon: Boxes, note: `${count(current.tasks)} tasks · ${count(current.turns)} turns`, id: "usage-model-calls" },
    { label: "Input served from cache", value: cacheShare(current.tokens), icon: Database, note: "Cache reads / all input tokens", id: "usage-cache-share" },
    { label: "Tokens per call", value: current.calls ? tokens(current.tokens.total / current.calls) : "—", icon: Layers3, note: "Average recorded request usage", id: "usage-tokens-per-call" },
  ];
  return <section className="usage-token-summary" aria-label="Recorded token summary">{cards.map(card => <article className="usage-kpi" key={card.id}>
    <div><span>{card.label}</span><card.icon size={16} /></div><strong data-testid={card.id} title={available ? card.exact : undefined}>{available ? card.value : "—"}</strong>
    <small>{available ? card.note : "Waiting for indexed usage"}</small>
  </article>)}</section>;
}

export function TokenTrend({ data, period, metric, onMetric }: { data: StatsDashboardPayload; period: UsagePeriod; metric: TokenMetric; onMetric: (value: TokenMetric) => void }) {
  const [focused, setFocused] = useState<string | null>(null);
  const rows = data.series.filter(row => row.from < data.generated_at), max = Math.max(1, ...rows.map(row => row.tokens[metric]));
  const active = rows.find(row => row.key === focused);
  const { peak, average } = activitySummary(data.token_activity.daily, metric, data.generated_at);
  const label = metric === "total" ? "Total tokens" : TOKEN_PARTS.find(part => part.key === metric)!.label;
  const noun = metric === "total" ? "tokens" : `${label.toLowerCase()} tokens`;
  return <section className="usage-panel usage-trend" aria-label="Token activity">
    <header className="usage-panel-heading"><div><h2><BarChart3 size={16} />Token activity</h2><p>{period === "all" ? "Monthly" : "Daily"} recorded usage · {data.filters.timezone}</p></div>
      <select aria-label="Token chart metric" value={metric} onChange={event => onMetric(event.target.value as TokenMetric)}><option value="total">Total tokens</option>{TOKEN_PARTS.map(part => <option key={part.key} value={part.key}>{part.label}</option>)}</select>
    </header>
    {rows.some(row => row.tokens[metric] > 0) ? <>
      <div className="usage-chart" role="group" aria-label={`${label} over time`}>
        <div className="usage-chart-axis"><span>{tokens(max)}</span><span>{tokens(max / 2)}</span><span>0</span></div>
        <div className="usage-chart-bars">{rows.map((row, index) => {
          const hint = `${dateLabel(row.from, data.filters.timezone)}: ${count(row.tokens[metric])} ${noun} · ${count(row.calls)} calls${row.to > data.generated_at ? " · Partial period" : ""}`;
          return <button type="button" key={row.key} title={hint} aria-label={`${hint}. Explore this period.`} onMouseEnter={() => setFocused(row.key)} onMouseLeave={() => setFocused(null)} onFocus={() => setFocused(row.key)} onBlur={() => setFocused(null)} onClick={() => navigateStatistics(statisticsHref(data.filters, { from: row.from, to: row.to }, metric))}>
            <span className="usage-chart-column"><i data-empty={row.tokens[metric] === 0} data-partial={row.to > data.generated_at} style={{ height: `${row.tokens[metric] / max * 100}%`, background: metric === "total" ? "var(--theme-accent)" : TOKEN_PARTS.find(part => part.key === metric)!.color }} /></span>
            <small>{rows.length <= 8 || index % Math.ceil(rows.length / 5) === 0 || index === rows.length - 1 ? dateLabel(row.from, data.filters.timezone) : ""}</small>
          </button>;
        })}</div>
      </div>
      <p className="usage-chart-readout" aria-live="polite">{active ? `${dateLabel(active.from, data.filters.timezone)} · ${count(active.tokens[metric])} ${noun} · ${count(active.calls)} calls${active.to > data.generated_at ? " · Partial period" : ""}` : "Hover or focus a bar for exact usage. Click to explore the period."}</p>
    </> : <div className="usage-history-empty">{hasTokenCoverage(data) ? `No ${noun} recorded for this selection.` : "Token history has not been indexed yet."}</div>}
    <div className="usage-chart-facts"><div><span>Daily average</span><b>{tokens(average)}</b><small>Includes zero-usage days</small></div><div><span>Busiest day</span><b>{peak ? dateLabel(peak.from, data.filters.timezone) : "—"}</b><small>{peak ? `${tokens(peak.tokens[metric])} tokens${peak.partial ? " · partial" : ""}` : "No dated usage"}</small></div><div><span>Observed agent time</span><b>{duration(data.summary.running_ms)}</b><small>Summed across participants</small></div></div>
  </section>;
}

export function TokenComposition({ data, metric, onMetric }: { data: StatsDashboardPayload; metric: TokenMetric; onMetric: (value: TokenMetric) => void }) {
  const summary = data.summary, total = summary.tokens.total;
  return <section className="usage-panel usage-composition" aria-label="Token composition">
    <header className="usage-panel-heading"><div><h2><Layers3 size={16} />Token composition</h2><p>Each recorded token is counted once</p></div><span>{tokens(total)} total</span></header>
    <div className="usage-token-stack" role="img" aria-label={TOKEN_PARTS.map(part => `${part.label}: ${count(summary.tokens[part.key])}`).join("; ")}>{TOKEN_PARTS.map(part => <i key={part.key} style={{ width: `${total ? summary.tokens[part.key] / total * 100 : 0}%`, background: part.color }} />)}</div>
    <div className="usage-token-parts">{TOKEN_PARTS.map(part => <button type="button" key={part.key} title={part.description} aria-pressed={metric === part.key} onClick={() => onMetric(part.key)}>
      <i style={{ background: part.color }} /><span>{part.label}</span><strong title={count(summary.tokens[part.key])}>{tokens(summary.tokens[part.key])}</strong><small>{percent(summary.tokens[part.key], total)}</small>
    </button>)}</div>
    <p className="usage-note">Input excludes cache reads and writes. Output excludes separately recorded reasoning. Select a category to inspect its trend.</p>
  </section>;
}

function BreakdownPanel({ title, dimension, rows, filters, total }: { title: string; dimension: "source" | "model" | "project"; rows: StatsBreakdown[]; filters: StatsFilters; total: number }) {
  const sorted = [...rows].filter(row => row.tokens.total > 0).sort((a, b) => b.tokens.total - a.tokens.total).slice(0, 5);
  const name = (row: StatsBreakdown) => dimension === "source" ? sourceName(row.key) : dimension === "project" ? projectName(row.label) : readable(row.label);
  return <section className="usage-panel usage-breakdown" aria-label={title}>
    <header className="usage-panel-heading"><h2>{dimension === "project" ? <Folder size={16} /> : <Cpu size={16} />}{title}</h2><span>By tokens</span></header>
    {sorted.length ? <ol>{sorted.map(row => {
      const patch = dimension === "source" ? { sources: [row.key] } : dimension === "model" ? { models: [row.key] } : { projects: [row.key] };
      const href = statisticsHref(filters, patch);
      return <li key={row.key}><a href={href} title={`${row.label} · ${count(row.tokens.total)} tokens · ${count(row.calls)} calls`} onClick={event => { event.preventDefault(); navigateStatistics(href); }}>
        <div><span>{dimension === "source" && <i style={{ background: sourceColor(row.key) }} />}{name(row)}</span><strong>{tokens(row.tokens.total)}</strong></div>
        <div className="usage-breakdown-bar"><i style={{ width: `${total ? row.tokens.total / total * 100 : 0}%` }} /></div>
        <small>{percent(row.tokens.total, total)} of tokens <span>{count(row.calls)} calls · {row.calls ? tokens(row.tokens.total / row.calls) : "—"} / call</span></small>
      </a></li>;
    })}</ol> : <div className="usage-history-empty">No recorded usage for this breakdown.</div>}
  </section>;
}
export function TokenBreakdowns({ data }: { data: StatsDashboardPayload }) {
  return <section id="usage-breakdowns" className="usage-breakdowns" aria-label="Where tokens go">{([ ["Sources", "source"], ["Top models", "model"], ["Top projects", "project"] ] as const).map(([title, dimension]) => <BreakdownPanel key={dimension} title={title} dimension={dimension} rows={data.breakdowns[dimension]} filters={data.filters} total={data.summary.tokens.total} />)}</section>;
}

export function TokenSessions({ data, pending, error, onSelect }: { data: StatsSessionsPayload | null; pending: boolean; error: string | null; onSelect: (id: string) => void }) {
  return <section id="usage-sessions" className="usage-panel usage-sessions" aria-label="Most token-intensive tasks">
    <header className="usage-panel-heading"><div><h2><Boxes size={16} />Most token-intensive tasks</h2><p>Main sessions include their subagents. Open a task to inspect its usage.</p></div><span>Top 5</span></header>
    {error ? <p role="alert" className="usage-warning">{error}</p> : !data ? <div className="usage-history-empty">{pending ? "Loading tasks…" : "No task data yet."}</div> : data.rows.length ? <div className="usage-task-list">{data.rows.map((row, index) => <button type="button" key={row.id} className="usage-task-open" onClick={() => onSelect(row.id)}>
      <span className="usage-task-number">{index + 1}</span><span className="usage-task-name"><strong>{row.title || "Untitled"}</strong><small><i style={{ background: sourceColor(row.source) }} />{sourceName(row.source)} · {projectName(row.directory)}{row.subagents > 0 && ` · ${row.subagents} subagents`}</small></span>
      <span className="usage-task-tokens"><strong title={count(row.tokens.total)}>{tokens(row.tokens.total)}</strong><small>tokens{row.incomplete && " · partial"}</small></span><span className="usage-task-calls"><strong>{count(row.calls)}</strong><small>calls</small></span><ArrowUpRight size={15} />
    </button>)}</div> : <div className="usage-history-empty">No tasks with recorded usage in this period.</div>}
  </section>;
}

export function HistoryCoverage({ data }: { data: StatsDashboardPayload }) {
  return <details className="usage-coverage"><summary>Data coverage & methodology{data.summary.incomplete && <span>Partial coverage</span>}</summary>
    <p>Token totals come from local agent history. Subscription percentages are separate provider limits, not a conversion of token counts. Context size is not cumulative token usage.</p>
    <ul>{data.sources.map(source => <li key={source.source}><strong>{sourceName(source.source)}</strong><span>{source.state === "ready" ? `${count(source.indexed)} indexed sessions` : source.state === "loading" ? `Indexing ${count(source.indexed)} / ${count(source.total)} sessions` : "History unavailable"}{source.skipped > 0 && ` · ${count(source.skipped)} skipped`}{source.message && ` · ${source.message}`}</span></li>)}</ul>
    {data.undated_calls > 0 && <p>{count(data.undated_calls)} calls have no confirmed timestamp. They appear in all-time totals, not in dated charts.</p>}
    <p>Comparisons use recorded data for the previous equivalent period. Daily averages include zero-usage days and the current partial day. Observed agent time sums Running intervals; parallel agents can overlap. Missing measurements remain unknown.</p>
  </details>;
}
