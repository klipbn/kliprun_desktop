import type { SessionCatalogPayload } from "@shared/usage";
import { unionDuration, type UsageDataset } from "./aggregate";

/** Root-session metadata only; never load prompts or attribute helper time to a parent. */
export function buildSessionCatalog(data: Pick<UsageDataset, "sessions" | "intervals" | "attributions" | "observed_at">): SessionCatalogPayload {
  type Range = { start: number; end: number };
  const running = new Map<string, Range[]>(), models = new Map<string, Map<string, Range[]>>();
  const observed = new Set<string>();
  const intervals = new Map(data.intervals.map(interval => [interval.id, interval]));
  for (const interval of data.intervals) {
    observed.add(interval.session_id);
    if (interval.column_name !== "running") continue;
    const ranges = running.get(interval.session_id) ?? [];
    ranges.push({ start: interval.entered_at, end: Math.min(interval.exited_at ?? data.observed_at, data.observed_at) });
    running.set(interval.session_id, ranges);
  }
  for (const attr of data.attributions) {
    const interval = intervals.get(attr.interval_id);
    if (!interval || interval.column_name !== "running" || !attr.model) continue;
    const start = Math.max(interval.entered_at, attr.start), end = Math.min(interval.exited_at ?? data.observed_at, attr.end, data.observed_at);
    if (end <= start) continue;
    const byModel = models.get(interval.session_id) ?? new Map<string, Range[]>(), ranges = byModel.get(attr.model) ?? [];
    ranges.push({ start, end }); byModel.set(attr.model, ranges); models.set(interval.session_id, byModel);
  }
  return { observed_at: data.observed_at, sessions: data.sessions.filter(s => !s.parent_id).map(session => {
    const top = [...(models.get(session.id) ?? [])].map(([model, ranges]) => ({ model, ms: unionDuration(ranges) }))
      .sort((a, b) => b.ms - a.ms || a.model.localeCompare(b.model))[0];
    return { ...session, running_ms: observed.has(session.id) ? unionDuration(running.get(session.id) ?? []) : null,
      top_model: top?.model ?? null, top_model_ms: top?.ms ?? null };
  }).sort((a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id)) };
}
