import type { StatsTokenBucket, UsageTokens } from "@shared/usage";

export type TokenMetric = keyof UsageTokens;
export type ActivityMode = "daily" | "weekly";

export function calendarMonths(days: StatsTokenBucket[]) {
  const months = new Map<string, StatsTokenBucket[]>();
  for (const day of days) {
    const key = day.key.slice(0, 7), list = months.get(key) ?? [];
    list.push(day); months.set(key, list);
  }
  return [...months].map(([key, rows]) => {
    const [year, month] = key.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const lookup = new Map(rows.map(row => [Number(row.key.slice(-2)), row]));
    return { key, label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first),
      offset: (first.getUTCDay() + 6) % 7,
      days: Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => lookup.get(i + 1) ?? null) };
  });
}

export function activitySummary(rows: StatsTokenBucket[], metric: TokenMetric, now: number) {
  const elapsed = rows.filter(row => row.from < now);
  const total = elapsed.reduce((sum, row) => sum + row.tokens[metric], 0);
  const peak = elapsed.reduce<StatsTokenBucket | null>((best, row) => row.tokens[metric] > (best?.tokens[metric] ?? 0) ? row : best, null);
  return { total, peak, active: elapsed.filter(row => row.tokens[metric] > 0).length, periods: elapsed.length,
    average: elapsed.length ? total / elapsed.length : 0 };
}

export function dailyCSV(rows: StatsTokenBucket[], timezone: string): string {
  const header = "date,timezone,from,to,total,input,output,reasoning,cache_read,cache_write,other,calls,partial_period,incomplete_data";
  const cell = (value: string | number | boolean) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  return [header, ...rows.map(row => [row.key, timezone, row.from, row.to, row.tokens.total, row.tokens.input,
    row.tokens.output, row.tokens.reasoning, row.tokens.cache_read, row.tokens.cache_write, row.tokens.other,
    row.calls, row.partial, row.incomplete].map(cell).join(","))].join("\r\n") + "\r\n";
}
