import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { StatsTokenBucket } from "@shared/usage";
import { activitySummary, calendarMonths, dailyCSV } from "../activity";
import { TokenActivity } from "../TokenActivity";

const day = (key: string, total: number, overrides: Partial<StatsTokenBucket> = {}): StatsTokenBucket => ({ key,
  from: Date.parse(`${key}T00:00:00Z`), to: Date.parse(`${key}T00:00:00Z`) + 86400_000,
  tokens: { total, input: total, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, other: 0 },
  calls: total ? 1 : 0, incomplete: false, partial: false, ...overrides });
const daily = [day("2026-10-30", 100), day("2026-10-31", 0), day("2026-11-01", 300, { partial: true })];

test("calendar months align weekdays and leave dates outside the selected period empty", () => {
  const months = calendarMonths(daily);
  expect(months.map(m => [m.key, m.offset, m.days.length])).toEqual([["2026-10", 3, 31], ["2026-11", 6, 30]]);
  expect(months[0].days[28]).toBeNull();
  expect(months[0].days[29]?.tokens.total).toBe(100);
  expect(months[0].days[30]?.tokens.total).toBe(0);
  expect(months[1].days[0]?.tokens.total).toBe(300);
});

test("activity summaries include zero days in averages, exclude future days and follow the selected token type", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const rows = [...daily, day("2026-11-02", 0)];
  expect(activitySummary(rows, "total", now)).toMatchObject({ total: 400, active: 2, periods: 3, average: 400 / 3, peak: { key: "2026-11-01" } });
  expect(activitySummary(rows, "output", now)).toMatchObject({ total: 0, active: 0, average: 0, peak: null });
});

test("daily export preserves exact token counts, date bounds and data quality flags", () => {
  const csv = dailyCSV([day("2026-11-01", 1234567, { incomplete: true, partial: true })], "Europe/Moscow");
  expect(csv).toContain("date,timezone,from,to,total,input,output,reasoning,cache_read,cache_write,other,calls,partial_period,incomplete_data");
  expect(csv).toContain("2026-11-01,Europe/Moscow,1793491200000,1793577600000,1234567,1234567,0,0,0,0,0,1,true,true");
});

test("the token activity view exposes modes, zero usage, partial periods and exact accessible values", () => {
  const html = renderToStaticMarkup(<TokenActivity activity={{ daily, weekly: [] }} timezone="UTC"
    now={Date.parse("2026-11-01T12:00:00Z")} mode="daily" metric="total" onMode={() => {}} onMetric={() => {}} onRange={() => {}} />);
  expect(html).toContain("Daily"); expect(html).toContain("Weekly");
  expect(html).toContain("300 total tokens");
  expect(html).toContain("No recorded tokens");
  expect(html).toContain("Partial period");
  expect(html).toContain("Export daily CSV");
});
