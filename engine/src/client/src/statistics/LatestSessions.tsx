import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, Loader2 } from "lucide-react";
import type { StatsSessionsPayload } from "@shared/usage";
import { cacheShare, count, dateLabel, duration, projectName, readable, sourceName, tokens, TOKEN_PARTS } from "./format";
import { useStatsRequest } from "./useStatsRequest";

const COUNTS = [5, 10, 20, 50];
const STORAGE_KEY = "kliprun.statistics.latest-count";
function initialCount() {
  try { const value = Number(localStorage.getItem(STORAGE_KEY)); return COUNTS.includes(value) ? value : 10; }
  catch { return 10; }
}

export function LatestSessions({ query, refresh, timezone, onSelect }: {
  query: string; refresh: number; timezone: string; onSelect: (id: string) => void;
}) {
  const [limit, setLimit] = useState(initialCount);
  const [retry, setRetry] = useState(0);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, String(limit)); } catch { /* storage unavailable */ } }, [limit]);
  const { data, pending, error } = useStatsRequest<StatsSessionsPayload>(`/api/stats/sessions?${query}&sort=recent&page=1&limit=${limit}`, refresh + retry);
  const rows = data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.tokens.total, 0);
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  const measured = rows.filter(row => row.running_ms !== null);
  const running = measured.length ? measured.reduce((sum, row) => sum + row.running_ms!, 0) : null;
  return <section id="stats-latest" className="stats-section stats-panel stats-latest" aria-label="Latest sessions">
    <div className="stats-section-title"><div><h2><Clock3 size={18} />Latest sessions</h2><p>Newest activity in the selected period. Main sessions include their subagents.</p></div>
      <label className="stats-sort-control"><span>Show</span><select className="stats-select" aria-label="Number of latest sessions" value={limit} onChange={event => setLimit(Number(event.target.value))}>
        {COUNTS.map(value => <option key={value} value={value}>{value} sessions</option>)}
      </select></label>
    </div>
    {error && <p className="stats-error" role="alert">{error} <button type="button" className="stats-button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {pending && !data && <div className="stats-loading"><Loader2 size={18} className="animate-spin" />Loading latest sessions…</div>}
    {data && (rows.length ? <>
      <div className="stats-latest-summary">
        <div><span>Sessions shown</span><strong>{count(rows.length)}<small> / {count(data.total)}</small></strong></div>
        <div><span>Total tokens</span><strong title={count(total)}>{tokens(total)}</strong><small>{tokens(total / rows.length)} average / session</small></div>
        <div><span>Model calls</span><strong>{count(calls)}</strong><small>{count(rows.reduce((sum, row) => sum + row.turns, 0))} user turns</small></div>
        <div><span>Agent time</span><strong>{duration(running)}</strong><small>Observed for {measured.length} of {rows.length} sessions</small></div>
      </div>
      <div className="stats-table-scroll stats-latest-scroll" tabIndex={0} aria-label="Latest session statistics table"><table className="stats-table stats-latest-table"><thead><tr>
        <th>Session / project</th><th>Agents / models</th><th>Last activity</th><th>Total tokens</th>
        {TOKEN_PARTS.map(part => <th key={part.key} title={part.description}>{part.label}</th>)}
        <th>Calls / turns</th><th>Running / active</th><th>Recorded cost</th><th />
      </tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td><button type="button" className="stats-task-name" onClick={() => onSelect(row.id)} title={row.title}>
          <span className="stats-task-title">{row.title || "Untitled"}</span>
          <span className="stats-task-project" title={row.directory}><i className="stats-source-dot" data-source={row.source} />{projectName(row.directory)}<span className="stats-task-source">{sourceName(row.source)}</span></span>
        </button>{row.subagents > 0 && <small className="stats-muted">Includes {row.subagents} subagents</small>}{row.incomplete && <span className="stats-partial" title="Usage or observed time may be incomplete">partial</span>}</td>
        <td><div className="stats-task-agents" title={row.agents.map(readable).join(", ")}>{row.agents.map(readable).join(", ") || "Unknown"}</div><div className="stats-task-models" title={row.models.map(readable).join(", ")}>{row.models.map(readable).join(", ") || "Unknown"}</div></td>
        <td>{row.last_at ? dateLabel(row.last_at, timezone, true) : "Unknown"}</td>
        <td title={count(row.tokens.total)}><b>{tokens(row.tokens.total)}</b><small>{cacheShare(row.tokens)} input cached</small></td>
        {TOKEN_PARTS.map(part => <td key={part.key} title={`${part.description} ${count(row.tokens[part.key])} tokens.`}>{tokens(row.tokens[part.key])}</td>)}
        <td>{count(row.calls)} calls<small>{count(row.turns)} turns</small></td>
        <td>{duration(row.running_ms)}<small>{duration(row.active_ms)} active</small></td>
        <td>{row.cost === null ? "No data" : row.cost.toLocaleString("en-US", { maximumFractionDigits: 4 })}<small>{count(row.cost_calls)} / {count(row.calls)} calls</small></td>
        <td><button type="button" className="stats-icon-button" onClick={() => onSelect(row.id)} aria-label={`Session statistics: ${row.title}`}><ArrowUpRight size={16} /></button></td>
      </tr>)}</tbody></table></div>
      <p className="stats-note">{timezone} · Each token is counted once. Costs are shown as recorded by the source; missing costs and unobserved time are not zero.{pending && " Refreshing…"}</p>
    </> : <div className="stats-table-empty">No sessions match the selected period and filters.</div>)}
  </section>;
}
