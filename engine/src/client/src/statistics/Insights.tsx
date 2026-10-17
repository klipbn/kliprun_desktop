import { ArrowUpRight, Cpu, Folder, Layers3, Sparkles } from "lucide-react";
import type { StatsDashboardPayload, UsageMetrics } from "@shared/usage";
import { activitySummary, type TokenMetric } from "./activity";
import { cacheShare, count, dateLabel, percent, projectName, readable, tokens, TOKEN_PARTS } from "./format";

export function UsageInsights({ data, onRange, onModel, onProject }: { data: StatsDashboardPayload;
  onRange: (from: number, to: number) => void; onModel: (value: string) => void; onProject: (value: string) => void }) {
  const { peak } = activitySummary(data.token_activity.daily, "total", data.generated_at);
  const model = data.breakdowns.model.find(row => row.tokens.total > 0);
  const project = data.breakdowns.project.find(row => row.tokens.total > 0);
  const total = data.summary.tokens.total;
  return <section className="stats-insights" aria-label="Usage highlights">
    <button type="button" className="stats-insight" disabled={!peak} onClick={() => peak && onRange(peak.from, peak.to)}>
      <span><Sparkles size={14} />Peak day<ArrowUpRight size={13} /></span><strong>{peak ? dateLabel(peak.from, data.filters.timezone) : "No dated usage"}</strong><small>{peak ? `${tokens(peak.tokens.total)} tokens${peak.partial ? " · partial day" : ""}` : "Choose a period with token usage"}</small>
    </button>
    <button type="button" className="stats-insight" disabled={!model} title={model?.label} onClick={() => model && onModel(model.key)}>
      <span><Cpu size={14} />Leading model<ArrowUpRight size={13} /></span><strong>{model ? readable(model.label) : "No model data"}</strong><small>{model ? `${percent(model.tokens.total, total)} of tokens · click to filter` : "No recorded token usage"}</small>
    </button>
    <button type="button" className="stats-insight" disabled={!project} title={project?.label} onClick={() => project && onProject(project.key)}>
      <span><Folder size={14} />Leading project<ArrowUpRight size={13} /></span><strong>{project ? projectName(project.label) : "No project data"}</strong><small>{project ? `${percent(project.tokens.total, total)} of tokens · click to filter` : "No recorded token usage"}</small>
    </button>
    <div className="stats-insight"><span><Layers3 size={14} />Average per task</span><strong>{data.summary.tasks ? tokens(total / data.summary.tasks) : "—"}<small> tokens</small></strong><small>{count(data.summary.tasks)} tasks in the selected period</small></div>
  </section>;
}

export function TokenMix({ summary, onMetric }: { summary: UsageMetrics; onMetric: (metric: TokenMetric) => void }) {
  const total = summary.tokens.total;
  return <section className="stats-section stats-panel stats-token-mix" aria-label="Token mix">
    <div className="stats-section-title"><div><h2>Token mix</h2><p>What makes up the recorded usage</p></div><span className="stats-small-tag">{tokens(total)} tokens</span></div>
    <div className="stats-token-stack" role="img" aria-label={TOKEN_PARTS.map(part => `${part.label}: ${count(summary.tokens[part.key])}`).join("; ")}>
      {TOKEN_PARTS.map(part => <span key={part.key} style={{ width: `${total ? summary.tokens[part.key] / total * 100 : 0}%`, background: part.color }} title={`${part.label}: ${count(summary.tokens[part.key])}`} />)}
    </div>
    <div className="stats-token-mix-list">{TOKEN_PARTS.map(part => <button type="button" key={part.key} onClick={() => onMetric(part.key)} title={`${part.description} Show in the heatmap.`}>
      <i style={{ background: part.color }} /><span>{part.label}</span><strong title={count(summary.tokens[part.key])}>{tokens(summary.tokens[part.key])}</strong><small>{percent(summary.tokens[part.key], total)}</small><ArrowUpRight size={12} />
    </button>)}</div>
    <div className="stats-token-ratios"><div><span>Input served from cache</span><b>{cacheShare(summary.tokens)}</b><small>Cached input / all input tokens</small></div><div><span>Average per model call</span><b>{summary.calls ? tokens(total / summary.calls) : "—"}</b><small>Across {count(summary.calls)} recorded calls</small></div></div>
    <p className="stats-activity-note">Each token is counted once. Cached input means cache reads. Cache reads and writes are separate from uncached input. Click a token type to explore it in the heatmap.</p>
  </section>;
}
