import { useEffect, useMemo, useState } from "react";
import type { StatsDashboardPayload, StatsSessionsPayload } from "@shared/usage";
import { browserTimezone, serializeFilters } from "../statistics/filters";
import { useStatsRequest } from "../statistics/useStatsRequest";
import { usageFilters, USAGE_PERIODS, type UsagePeriod } from "./overview";

function initial() {
  const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const period = USAGE_PERIODS.find(item => item.key === query.get("period"))?.key ?? "7";
  const raw = query.get("source"), source = raw && ["opencode", "codex", "claude"].includes(raw) ? raw : "";
  return { period, source };
}
export function useUsageHistory(now: number, refresh: number) {
  const [period, setPeriod] = useState<UsagePeriod>(() => initial().period);
  const [source, setSource] = useState(() => initial().source);
  const timezone = browserTimezone(), localDay = new Date(now).toDateString();
  const filters = useMemo(() => usageFilters(period, source, now, timezone), [period, source, timezone, localDay]);
  const parameters = serializeFilters(filters); parameters.set("period", period);
  const query = parameters.toString();
  const dashboard = useStatsRequest<StatsDashboardPayload>(`/api/stats?${query}`, refresh);
  const ranking = useStatsRequest<StatsSessionsPayload>(`/api/stats/sessions?${query}&sort=tokens&page=1&limit=5`, refresh);
  useEffect(() => {
    const query = new URLSearchParams({ period }); if (source) query.set("source", source);
    window.history.replaceState(window.history.state, "", `/usage?${query}`);
  }, [period, source]);
  return { period, setPeriod, source, setSource, filters, dashboard, ranking };
}
